import {
  GitHubPullRequestsSearchParams,
  GitHubPullRequestItem,
} from '../../types/github-openapi';
import {
  GitHubPullRequestSearchResult,
  GitHubPullRequestSearchError,
} from '../../mcp/tools/scheme/github_search_pull_requests';
import { ContentSanitizer } from '../../security/contentSanitizer';
import { getOctokit, OctokitWithThrottling } from './client';
import { handleGitHubAPIError } from './errors';
import {
  buildPullRequestSearchQuery,
  shouldUseSearchForPRs,
} from './queryBuilders';

/**
 * Search GitHub pull requests using Octokit API
 */
export async function searchGitHubPullRequestsAPI(
  params: GitHubPullRequestsSearchParams,
  token?: string
): Promise<GitHubPullRequestSearchResult | GitHubPullRequestSearchError> {
  try {
    // If prNumber is provided with owner/repo, fetch specific PR by number
    if (
      params.prNumber &&
      params.owner &&
      params.repo &&
      !Array.isArray(params.owner) &&
      !Array.isArray(params.repo)
    ) {
      return await fetchGitHubPullRequestByNumberAPI(
        params.owner,
        params.repo,
        params.prNumber,
        token
      );
    }

    const octokit = getOctokit(token);

    // Decide between search and list based on filters
    const shouldUseSearch = shouldUseSearchForPRs(params);

    if (
      !shouldUseSearch &&
      params.owner &&
      params.repo &&
      !Array.isArray(params.owner) &&
      !Array.isArray(params.repo)
    ) {
      // Use REST API for simple repository-specific searches (like gh pr list)
      return await searchPullRequestsWithREST(octokit, params, token);
    }

    // Use Search API for complex queries (like gh search prs)
    const searchQuery = buildPullRequestSearchQuery(params);

    if (!searchQuery) {
      return {
        error: 'No valid search parameters provided',
        status: 400,
        hints: ['Provide search query or filters like owner/repo'],
      };
    }

    // Execute search using GitHub Search API (issues endpoint filters PRs)
    const searchResult = await octokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
      sort:
        params.sort && params.sort !== 'best-match' ? params.sort : undefined,
      order: params.order || 'desc',
      per_page: Math.min(params.limit || 30, 100),
    });

    const pullRequests =
      searchResult.data.items?.filter((item: any) => item.pull_request) || [];

    // Transform pull requests to our expected format
    const transformedPRs: GitHubPullRequestItem[] = await Promise.all(
      pullRequests.map(async (item: any) => {
        return await transformPullRequestItem(item, params, octokit, token);
      })
    );

    return {
      total_count: searchResult.data.total_count,
      incomplete_results: searchResult.data.incomplete_results,
      pull_requests: transformedPRs as any,
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    return {
      error: `Pull request search failed: ${apiError.error}`,
      status: apiError.status,
      rateLimitRemaining: apiError.rateLimitRemaining,
      rateLimitReset: apiError.rateLimitReset,
      hints: [`Verify authentication and search parameters`],
      type: apiError.type,
    };
  }
}

/**
 * Use REST API for simple repository-specific searches (like gh pr list)
 */
async function searchPullRequestsWithREST(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  params: GitHubPullRequestsSearchParams,
  token?: string
): Promise<GitHubPullRequestSearchResult | GitHubPullRequestSearchError> {
  try {
    const owner = params.owner as string;
    const repo = params.repo as string;

    // Use pulls.list for simple repository searches
    const listParams: any = {
      owner,
      repo,
      state: params.state || 'open',
      per_page: Math.min(params.limit || 30, 100),
      // REST API only supports 'created' and 'updated' sort for pulls.list
      sort: params.sort === 'updated' ? 'updated' : 'created',
      direction: params.order || 'desc',
    };

    // Add simple filters that REST API supports
    if (params.head) listParams.head = params.head;
    if (params.base) listParams.base = params.base;

    const result = await octokit.rest.pulls.list(listParams);

    // Transform to our expected format
    const transformedPRs: GitHubPullRequestItem[] = await Promise.all(
      result.data.map(async (item: any) => {
        return await transformPullRequestItemFromREST(
          item,
          params,
          octokit,
          token
        );
      })
    );

    return {
      total_count: transformedPRs.length, // REST API doesn't provide total count
      incomplete_results: false,
      pull_requests: transformedPRs as any,
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    return {
      error: `Pull request list failed: ${apiError.error}`,
      status: apiError.status,
      rateLimitRemaining: apiError.rateLimitRemaining,
      rateLimitReset: apiError.rateLimitReset,
      hints: [`Verify repository access and authentication`],
      type: apiError.type,
    };
  }
}

/**
 * Transform pull request item from Search API response
 */
async function transformPullRequestItem(
  item: any,
  params: GitHubPullRequestsSearchParams,
  octokit: InstanceType<typeof OctokitWithThrottling>,
  token?: string
): Promise<GitHubPullRequestItem> {
  // Sanitize title and body content
  const titleSanitized = ContentSanitizer.sanitizeContent(item.title || '');
  const bodySanitized = item.body
    ? ContentSanitizer.sanitizeContent(item.body)
    : { content: undefined, warnings: [] };

  // Collect all sanitization warnings
  const sanitizationWarnings = new Set<string>([
    ...titleSanitized.warnings,
    ...bodySanitized.warnings,
  ]);

  const result: GitHubPullRequestItem = {
    number: item.number,
    title: titleSanitized.content,
    body: bodySanitized.content,
    state: item.state?.toLowerCase() || 'unknown',
    author: item.user?.login || '',
    repository: item.repository_url
      ? item.repository_url.replace('https://api.github.com/repos/', '')
      : 'unknown',
    labels: item.labels?.map((l: any) => l.name) || [],
    created_at: item.created_at
      ? new Date(item.created_at).toLocaleDateString('en-GB')
      : '',
    updated_at: item.updated_at
      ? new Date(item.updated_at).toLocaleDateString('en-GB')
      : '',
    url: item.html_url,
    comments: [], // Will be populated if withComments is true
    reactions: item.reactions?.total_count || 0,
    draft: item.draft || false,
  };

  // Add sanitization warnings if any were detected
  if (sanitizationWarnings.size > 0) {
    result._sanitization_warnings = Array.from(sanitizationWarnings);
  }

  // Add optional fields
  if (item.closed_at) {
    result.closed_at = new Date(item.closed_at).toLocaleDateString('en-GB');
  }

  // Get additional PR details if needed (head/base SHA, etc.)
  if (params.getCommitData || item.pull_request) {
    try {
      const [owner, repo] = result.repository.split('/');
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
          result.draft = prDetails.data.draft || false;

          // Fetch commit data if requested
          if (params.getCommitData) {
            const commitData = await fetchPRCommitDataAPI(
              owner,
              repo,
              item.number,
              token
            );
            if (commitData) {
              result.commits = commitData;
            }
          }
        }
      }
    } catch (e) {
      // Continue without additional details if API call fails
    }
  }

  // Fetch comments if requested
  if (params.withComments) {
    try {
      const [owner, repo] = result.repository.split('/');
      if (owner && repo) {
        const commentsResult = await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: item.number,
        });

        result.comments = commentsResult.data.map((comment: any) => ({
          id: comment.id,
          user: comment.user?.login || 'unknown',
          body: ContentSanitizer.sanitizeContent(comment.body || '').content,
          created_at: new Date(comment.created_at).toLocaleDateString('en-GB'),
          updated_at: new Date(comment.updated_at).toLocaleDateString('en-GB'),
        }));
      }
    } catch (e) {
      // Continue without comments if API call fails
    }
  }

  return result;
}

/**
 * Transform pull request item from REST API response
 */
export async function transformPullRequestItemFromREST(
  item: any,
  params: GitHubPullRequestsSearchParams,
  octokit: InstanceType<typeof OctokitWithThrottling>,
  token?: string
): Promise<GitHubPullRequestItem> {
  // Sanitize title and body content
  const titleSanitized = ContentSanitizer.sanitizeContent(item.title || '');
  const bodySanitized = item.body
    ? ContentSanitizer.sanitizeContent(item.body)
    : { content: undefined, warnings: [] };

  // Collect all sanitization warnings
  const sanitizationWarnings = new Set<string>([
    ...titleSanitized.warnings,
    ...bodySanitized.warnings,
  ]);

  const result: GitHubPullRequestItem = {
    number: item.number,
    title: titleSanitized.content,
    body: bodySanitized.content,
    state: item.state?.toLowerCase() || 'unknown',
    author: item.user?.login || '',
    repository: `${params.owner}/${params.repo}`,
    labels: item.labels?.map((l: any) => l.name) || [],
    created_at: item.created_at
      ? new Date(item.created_at).toLocaleDateString('en-GB')
      : '',
    updated_at: item.updated_at
      ? new Date(item.updated_at).toLocaleDateString('en-GB')
      : '',
    url: item.html_url,
    comments: [], // Will be populated if withComments is true
    reactions: 0, // REST API doesn't provide reactions in list
    draft: item.draft || false,
    head: item.head?.ref,
    head_sha: item.head?.sha,
    base: item.base?.ref,
    base_sha: item.base?.sha,
  };

  // Add sanitization warnings if any were detected
  if (sanitizationWarnings.size > 0) {
    result._sanitization_warnings = Array.from(sanitizationWarnings);
  }

  // Add optional fields
  if (item.closed_at) {
    result.closed_at = new Date(item.closed_at).toLocaleDateString('en-GB');
  }
  if (item.merged_at) {
    result.merged_at = new Date(item.merged_at).toLocaleDateString('en-GB');
  }

  // Fetch commit data if requested
  if (params.getCommitData) {
    const commitData = await fetchPRCommitDataAPI(
      params.owner as string,
      params.repo as string,
      item.number,
      token
    );
    if (commitData) {
      result.commits = commitData;
    }
  }

  // Fetch comments if requested
  if (params.withComments) {
    try {
      const commentsResult = await octokit.rest.issues.listComments({
        owner: params.owner as string,
        repo: params.repo as string,
        issue_number: item.number,
      });

      result.comments = commentsResult.data.map((comment: any) => ({
        id: comment.id,
        user: comment.user?.login || 'unknown',
        body: ContentSanitizer.sanitizeContent(comment.body || '').content,
        created_at: new Date(comment.created_at).toLocaleDateString('en-GB'),
        updated_at: new Date(comment.updated_at).toLocaleDateString('en-GB'),
      }));
    } catch (e) {
      // Continue without comments if API call fails
    }
  }

  return result;
}

/**
 * Fetch commit data for a pull request using API
 */
async function fetchPRCommitDataAPI(
  owner: string,
  repo: string,
  prNumber: number,
  token?: string
) {
  try {
    const octokit = getOctokit(token);

    // Get commits in the PR
    const commitsResult = await octokit.rest.pulls.listCommits({
      owner,
      repo,
      pull_number: prNumber,
    });

    const commits = commitsResult.data || [];

    if (commits.length === 0) {
      return null;
    }

    // Fetch detailed commit data for each commit (limit to first 10 to avoid rate limits)
    const commitDetails = await Promise.all(
      commits.slice(0, 10).map(async (commit: any) => {
        try {
          const commitResult = await octokit.rest.repos.getCommit({
            owner,
            repo,
            ref: commit.sha,
          });

          const result = commitResult.data;

          // Sanitize commit message from the detailed commit data
          const messageSanitized = ContentSanitizer.sanitizeContent(
            result.commit?.message || ''
          );
          const commitWarningsSet = new Set<string>(messageSanitized.warnings);

          return {
            sha: commit.sha,
            message: messageSanitized.content,
            author:
              result.author?.login || result.commit?.author?.name || 'Unknown',
            url: result.html_url,
            authoredDate: result.commit?.author?.date,
            diff: result.files
              ? {
                  changed_files: result.files.length,
                  additions: result.stats?.additions || 0,
                  deletions: result.stats?.deletions || 0,
                  total_changes: result.stats?.total || 0,
                  files: result.files.slice(0, 5).map((f: any) => {
                    const fileObj: any = {
                      filename: f.filename,
                      status: f.status,
                      additions: f.additions,
                      deletions: f.deletions,
                      changes: f.changes,
                    };

                    // Sanitize patch content if present
                    if (f.patch) {
                      const rawPatch =
                        f.patch.substring(0, 1000) +
                        (f.patch.length > 1000 ? '...' : '');
                      const patchSanitized =
                        ContentSanitizer.sanitizeContent(rawPatch);
                      fileObj.patch = patchSanitized.content;

                      // Collect patch sanitization warnings
                      if (patchSanitized.warnings.length > 0) {
                        patchSanitized.warnings.forEach(w =>
                          commitWarningsSet.add(`[${f.filename}] ${w}`)
                        );
                      }
                    }

                    return fileObj;
                  }),
                }
              : undefined,
            // Add sanitization warnings if any were detected
            ...(commitWarningsSet.size > 0 && {
              _sanitization_warnings: Array.from(commitWarningsSet),
            }),
          };
        } catch (e) {
          // If we can't fetch commit details, return basic info from list commits
          return {
            sha: commit.sha,
            message: commit.commit?.message || '',
            author:
              commit.author?.login || commit.commit?.author?.name || 'Unknown',
            url: commit.html_url,
            authoredDate: commit.commit?.author?.date,
          };
        }
      })
    );

    return {
      total_count: commits.length,
      commits: commitDetails.filter(Boolean),
    };
  } catch (error) {
    return null;
  }
}

/**
 * Fetch a specific pull request by number using GitHub REST API
 * More efficient than search when we know the exact PR number
 */
export async function fetchGitHubPullRequestByNumberAPI(
  owner: string,
  repo: string,
  prNumber: number,
  token?: string
): Promise<GitHubPullRequestSearchResult | GitHubPullRequestSearchError> {
  try {
    const octokit = getOctokit(token);

    // Use REST API to get specific PR by number
    const result = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const pr = result.data;

    // Transform to our expected format
    const transformedPR: GitHubPullRequestItem =
      await transformPullRequestItemFromREST(
        pr,
        { owner, repo, prNumber },
        octokit,
        token
      );

    return {
      total_count: 1,
      incomplete_results: false,
      pull_requests: [transformedPR] as any,
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    return {
      error: `Failed to fetch pull request #${prNumber}: ${apiError.error}`,
      status: apiError.status,
      rateLimitRemaining: apiError.rateLimitRemaining,
      rateLimitReset: apiError.rateLimitReset,
      hints: [
        `Verify that pull request #${prNumber} exists in ${owner}/${repo}`,
        'Check if you have access to this repository',
        'Ensure the PR number is correct',
      ],
      type: apiError.type,
    };
  }
}

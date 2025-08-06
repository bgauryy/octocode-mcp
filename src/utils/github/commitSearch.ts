import {
  GitHubCommitSearchParams,
  GitHubCommitSearchItem,
  OptimizedCommitSearchResult,
} from '../../types/github-openapi';
import {
  GitHubCommitSearchResult,
  GitHubCommitSearchError,
} from '../../mcp/tools/scheme/github_search_commits';
import { ContentSanitizer } from '../../security/contentSanitizer';
import { getOctokit } from './client';
import { handleGitHubAPIError } from './errors';
import { buildCommitSearchQuery } from './queryBuilders';
import { generateCacheKey, withCache } from '../cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../../mcp/responses';

/**
 * Search GitHub commits using Octokit API with caching
 */
export async function searchGitHubCommitsAPI(
  params: GitHubCommitSearchParams,
  token?: string
): Promise<GitHubCommitSearchResult | GitHubCommitSearchError> {
  // Generate cache key based on search parameters only (NO TOKEN DATA)
  const cacheKey = generateCacheKey('gh-commits-api', params);

  // Create a wrapper function that returns CallToolResult for the cache
  const searchOperation = async (): Promise<CallToolResult> => {
    const result = await searchGitHubCommitsAPIInternal(params, token);

    // Convert to CallToolResult for caching
    if ('error' in result) {
      return createResult({
        isError: true,
        data: result,
      });
    } else {
      return createResult({
        data: result,
      });
    }
  };

  // Use cache with 1-hour TTL (configured in cache.ts)
  const cachedResult = await withCache(cacheKey, searchOperation);

  // Convert CallToolResult back to the expected format
  if (cachedResult.isError) {
    // Extract the actual error data from the CallToolResult
    const jsonText = (cachedResult.content[0] as { text: string }).text;
    const parsedData = JSON.parse(jsonText);
    return parsedData.data as GitHubCommitSearchError;
  } else {
    // Extract the actual success data from the CallToolResult
    const jsonText = (cachedResult.content[0] as { text: string }).text;
    const parsedData = JSON.parse(jsonText);
    return parsedData.data as GitHubCommitSearchResult;
  }
}

/**
 * Internal implementation of searchGitHubCommitsAPI without caching
 */
async function searchGitHubCommitsAPIInternal(
  params: GitHubCommitSearchParams,
  token?: string
): Promise<GitHubCommitSearchResult | GitHubCommitSearchError> {
  try {
    const octokit = getOctokit(token);

    // Build search query
    const searchQuery = buildCommitSearchQuery(params);

    if (!searchQuery) {
      return {
        error: 'No valid search parameters provided',
        status: 400,
        hints: [
          'Provide search query or filters like author, committer, hash, or date',
        ],
      };
    }

    // Execute search using GitHub Search API with proper pagination
    // Use max 100 per page and handle pagination internally
    const perPage = Math.min(params.limit || 25, 100);
    let allCommits: GitHubCommitSearchItem[] = [];
    let totalCount = 0;
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage && allCommits.length < (params.limit || 25)) {
      const searchResult = await octokit.rest.search.commits({
        q: searchQuery,
        sort: params.sort === 'author-date' ? 'author-date' : 'committer-date',
        order: params.order || 'desc',
        per_page: perPage,
        page: page,
      });

      const commits = searchResult.data.items || [];
      totalCount = searchResult.data.total_count || 0;

      // Add commits up to the requested limit
      const remainingSlots = (params.limit || 25) - allCommits.length;
      const commitsToAdd = commits.slice(0, remainingSlots);
      allCommits = allCommits.concat(commitsToAdd);

      // Check if we have more pages
      hasNextPage =
        commits.length === perPage && allCommits.length < (params.limit || 25);
      page++;

      // Safety break to avoid infinite loops
      if (page > 10) break;
    }

    // Transform commits to our expected format
    const transformedCommits: GitHubCommitSearchItem[] = allCommits.map(
      (item: GitHubCommitSearchItem) => ({
        sha: item.sha,
        commit: {
          message: item.commit?.message || '',
          author: {
            name: item.commit?.author?.name || 'Unknown',
            email: item.commit?.author?.email || '',
            date: item.commit?.author?.date || '',
          },
          committer: {
            name: item.commit?.committer?.name || 'Unknown',
            email: item.commit?.committer?.email || '',
            date: item.commit?.committer?.date || '',
          },
        },
        author: item.author
          ? {
              login: item.author.login,
              id: item.author.id,
              type: item.author.type || 'User',
              url: item.author.url,
            }
          : undefined,
        committer: item.committer
          ? {
              login: item.committer.login,
              id: item.committer.id,
              type: item.committer.type || 'User',
              url: item.committer.url,
            }
          : undefined,
        repository: item.repository,
        url: item.url,
      })
    );

    // Transform to optimized format similar to CLI implementation
    const optimizedResult = await transformCommitsToOptimizedFormatAPI(
      transformedCommits,
      params,
      token
    );

    // Transform optimized commits back to expected GitHub format
    const formattedCommits = optimizedResult.commits.map(commit => ({
      sha: commit.sha,
      node_id: `MDQ6Q29tbWl0${commit.sha}`,
      url: commit.url,
      html_url: commit.url,
      commit: {
        message: commit.message,
        author: {
          name: commit.author,
          email: '',
          date: commit.date,
        },
        committer: {
          name: commit.author,
          email: '',
          date: commit.date,
        },
        tree: {
          sha: commit.sha,
          url: commit.url,
        },
      },
      author: undefined,
      committer: undefined,
      parents: [],
      repository: commit.repository
        ? {
            id: 0,
            name: commit.repository.split('/').pop() || '',
            full_name: commit.repository,
            owner: {
              login: commit.repository.split('/')[0] || '',
              id: 0,
            },
            private: false,
            html_url: `https://github.com/${commit.repository}`,
          }
        : undefined,
      score: 1,
      files: commit.diff?.files?.map(file => ({
        ...file,
        status: file.status as
          | 'added'
          | 'removed'
          | 'modified'
          | 'renamed'
          | 'copied'
          | 'changed'
          | 'unchanged',
      })),
      stats: commit.diff
        ? {
            total: commit.diff.total_changes as number,
            additions: commit.diff.additions as number,
            deletions: commit.diff.deletions as number,
          }
        : undefined,
    }));

    return {
      total_count: totalCount,
      incomplete_results: totalCount > allCommits.length,
      commits: formattedCommits,
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    return {
      error: `Commit search failed: ${apiError.error}`,
      status: apiError.status,
      rateLimitRemaining: apiError.rateLimitRemaining,
      rateLimitReset: apiError.rateLimitReset,
      hints: [`Verify authentication and search parameters`],
      type: apiError.type,
    };
  }
}

/**
 * Transform commits to optimized format for API results
 */
async function transformCommitsToOptimizedFormatAPI(
  items: GitHubCommitSearchItem[],
  params: GitHubCommitSearchParams,
  token?: string
): Promise<OptimizedCommitSearchResult> {
  // Extract repository info if single repo search
  const singleRepo = extractSingleRepositoryAPI(items);

  // Fetch diff information if requested and this is a repo-specific search
  const shouldFetchDiff =
    params.getChangesContent && params.owner && params.repo;
  const diffData: Map<string, Record<string, unknown>> = new Map();

  if (shouldFetchDiff && items.length > 0) {
    // Fetch diff info for each commit (limit to first 10 to avoid rate limits)
    const commitShas = items.slice(0, 10).map(item => item.sha);
    const octokit = getOctokit(token);

    const diffPromises = commitShas.map(async (sha: string) => {
      try {
        const commitResult = await octokit.rest.repos.getCommit({
          owner: params.owner!,
          repo: params.repo!,
          ref: sha,
        });
        return { sha, commitData: commitResult.data };
      } catch (e) {
        // Ignore diff fetch errors
        return { sha, commitData: null };
      }
    });

    const diffResults = await Promise.all(diffPromises);
    diffResults.forEach(({ sha, commitData }) => {
      if (commitData) {
        diffData.set(sha, commitData);
      }
    });
  }

  const optimizedCommits = items
    .map(item => {
      // Sanitize commit message
      const rawMessage = item.commit?.message ?? '';
      const messageSanitized = ContentSanitizer.sanitizeContent(rawMessage);
      const warningsCollectorSet = new Set<string>(messageSanitized.warnings);

      const commitObj: Record<string, unknown> = {
        sha: item.sha, // Use as branch parameter in github_fetch_content
        message: messageSanitized.content,
        author: item.author?.login ?? item.commit?.author?.name ?? 'Unknown',
        date: item.commit?.author?.date
          ? new Date(item.commit.author.date).toLocaleDateString('en-GB')
          : '',
        repository: singleRepo ? undefined : item.repository?.fullName || '',
        url:
          item.url ||
          `https://github.com/${item.repository?.fullName || 'unknown'}/commit/${item.sha}`,
      };

      // Add security warnings if any were detected
      if (warningsCollectorSet.size > 0) {
        commitObj._sanitization_warnings = Array.from(warningsCollectorSet);
      }

      // Add diff information if available
      if (shouldFetchDiff && diffData.has(item.sha)) {
        const commitData = diffData.get(item.sha) as Record<string, unknown>;
        const files =
          (commitData.files as Array<Record<string, unknown>>) || [];
        commitObj.diff = {
          changed_files: files.length,
          additions:
            (commitData.stats as Record<string, unknown>)?.additions || 0,
          deletions:
            (commitData.stats as Record<string, unknown>)?.deletions || 0,
          total_changes:
            (commitData.stats as Record<string, unknown>)?.total || 0,
          files: files
            .map((f: Record<string, unknown>) => {
              const fileObj: Record<string, unknown> = {
                filename: f.filename,
                status: f.status,
                additions: f.additions,
                deletions: f.deletions,
                changes: f.changes,
              };

              // Sanitize patch content if present
              if (f.patch && typeof f.patch === 'string') {
                const rawPatch =
                  f.patch.substring(0, 1000) +
                  (f.patch.length > 1000 ? '...' : '');
                const patchSanitized =
                  ContentSanitizer.sanitizeContent(rawPatch);
                fileObj.patch = patchSanitized.content;

                // Collect patch sanitization warnings
                if (patchSanitized.warnings.length > 0) {
                  patchSanitized.warnings.forEach(w =>
                    warningsCollectorSet.add(`[${f.filename}] ${w}`)
                  );
                }
              }

              return fileObj;
            })
            .slice(0, 5), // Limit to 5 files per commit
        };

        // Update warnings if patch sanitization added any
        if (
          warningsCollectorSet.size >
          (Array.isArray(commitObj._sanitization_warnings)
            ? commitObj._sanitization_warnings.length
            : 0)
        ) {
          commitObj._sanitization_warnings = Array.from(warningsCollectorSet);
        }
      }

      return commitObj;
    })
    .map(commit => {
      // Remove undefined fields
      const cleanCommit: Record<string, unknown> = {};
      Object.entries(commit).forEach(([key, value]) => {
        if (value !== undefined) {
          cleanCommit[key] = value;
        }
      });
      return cleanCommit;
    });

  const result: OptimizedCommitSearchResult = {
    commits: optimizedCommits as Array<{
      sha: string;
      message: string;
      author: string;
      date: string;
      repository?: string;
      url: string;
    }>,
    total_count: items.length,
  };

  // Add repository info if single repo
  if (singleRepo) {
    result.repository = {
      name: singleRepo.fullName,
      description: singleRepo.description,
    };
  }

  return result;
}

/**
 * Extract single repository if all results are from same repo (API version)
 */
function extractSingleRepositoryAPI(items: GitHubCommitSearchItem[]) {
  if (items.length === 0) return null;

  const firstRepo = items[0]?.repository;
  if (!firstRepo) return null;
  const allSameRepo = items.every(
    item => item.repository?.fullName === firstRepo.fullName
  );

  return allSameRepo ? firstRepo : null;
}

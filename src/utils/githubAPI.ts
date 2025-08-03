import { Octokit, RequestError } from 'octokit';
import { throttling } from '@octokit/plugin-throttling';
import type { OctokitOptions } from '@octokit/core';
import type { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createResult } from '../mcp/responses';
import {
  GitHubCommitSearchParams,
  GitHubCommitSearchItem,
  OptimizedCommitSearchResult,
  GitHubPullRequestsSearchParams,
  GitHubPullRequestItem,
  GitHubIssuesSearchParams,
} from '../types';
import { ContentSanitizer } from '../security/contentSanitizer';
import { minifyContentV2 } from './minifier';
import {
  GitHubCodeSearchItem,
  GitHubCodeSearchQuery,
  OptimizedCodeSearchResult,
} from '../mcp/tools/scheme/github_search_code';
import {
  GitHubFileContentResponse,
  GithubFetchRequestParams,
  GitHubFileContentError,
} from '../mcp/tools/scheme/github_fetch_content';
import {
  GitHubReposSearchParams,
  GitHubReposSearchResult,
} from '../mcp/tools/scheme/github_search_repos';
import {
  GitHubRepositoryStructureParams,
  GitHubApiFileItem,
  GitHubRepositoryStructureResult,
  GitHubRepositoryStructureError,
} from '../mcp/tools/scheme/github_view_repo_structure';
import {
  GitHubPullRequestSearchResult,
  GitHubPullRequestSearchError,
} from '../mcp/tools/scheme/github_search_pull_requests';
import {
  GitHubCommitSearchResult,
  GitHubCommitSearchError,
} from '../mcp/tools/scheme/github_search_commits';
import {
  GitHubIssueSearchResult,
  GitHubIssueSearchError,
} from '../mcp/tools/scheme/github_search_issues';

// TypeScript-safe conditional authentication following GitHub CLI patterns
const defaultToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

// TypeScript-safe parameter types using Octokit's built-in types
type SearchCodeParameters =
  RestEndpointMethodTypes['search']['code']['parameters'];
type SearchReposParameters =
  RestEndpointMethodTypes['search']['repos']['parameters'];
type SearchCodeResponse = RestEndpointMethodTypes['search']['code']['response'];
type GetContentParameters =
  RestEndpointMethodTypes['repos']['getContent']['parameters'];

// Define TextMatch type based on GitHub API response structure
interface TextMatch {
  fragment: string;
  matches?: Array<{
    text: string;
    indices: [number, number];
  }>;
}

// Enhanced error response type following GitHub CLI patterns
interface GitHubAPIError {
  error: string;
  status?: number;
  retryAfter?: number;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  scopesSuggestion?: string;
  type: 'http' | 'graphql' | 'network' | 'unknown';
}

// Create Octokit class with throttling plugin following GitHub CLI patterns
const OctokitWithThrottling = Octokit.plugin(throttling);

// Cache Octokit instances by token following GitHub CLI patterns
const octokitInstances = new Map<
  string,
  InstanceType<typeof OctokitWithThrottling>
>();

/**
 * Throttle options following GitHub CLI and official Octokit.js best practices
 * Based on patterns from GitHub CLI, Backstage, and other high-quality projects
 */
const createThrottleOptions = () => ({
  onRateLimit: (
    retryAfter: number,
    options: any,
    _octokit: any,
    retryCount: number
  ) => {
    // Log rate limit with detailed context (following GitHub CLI pattern)
    // eslint-disable-next-line no-console
    console.warn(
      `GitHub API rate limit exceeded for ${options.method} ${options.url}`
    );

    // Only retry once (following GitHub CLI pattern)
    if (retryCount === 0) {
      // eslint-disable-next-line no-console
      console.info(`Retrying after ${retryAfter} seconds!`);
      return true;
    }

    // eslint-disable-next-line no-console
    console.warn('Rate limit retry limit reached, not retrying');
    return false;
  },
  onSecondaryRateLimit: (
    retryAfter: number,
    options: any,
    _octokit: any,
    retryCount: number
  ) => {
    // Log secondary rate limit (abuse detection pattern)
    // eslint-disable-next-line no-console
    console.warn(
      `GitHub API secondary rate limit detected for ${options.method} ${options.url}`
    );

    // Following GitHub CLI pattern: retry once for secondary rate limits too
    if (retryCount === 0) {
      // eslint-disable-next-line no-console
      console.info(
        `Retrying after ${retryAfter} seconds due to secondary rate limit`
      );
      return true;
    }

    // eslint-disable-next-line no-console
    console.warn('Secondary rate limit retry limit reached, not retrying');
    return false;
  },
});

/**
 * Initialize Octokit with TypeScript-safe authentication and throttling plugin
 * Following GitHub CLI patterns for client initialization
 */
function getOctokit(
  token?: string
): InstanceType<typeof OctokitWithThrottling> {
  const useToken = token || defaultToken || '';
  const cacheKey = useToken || 'no-token';

  if (!octokitInstances.has(cacheKey)) {
    // TypeScript-safe configuration with throttling plugin following GitHub CLI
    const options: OctokitOptions & {
      throttle: ReturnType<typeof createThrottleOptions>;
    } = {
      userAgent: 'octocode-mcp/1.0.0 (GitHub CLI compatible)',
      request: {
        timeout: 30000, // 30 second timeout
      },
      // Use the separated throttle options for better maintainability
      throttle: createThrottleOptions(),
    };

    if (useToken) {
      options.auth = useToken;
    }

    octokitInstances.set(cacheKey, new OctokitWithThrottling(options));
  }
  return octokitInstances.get(cacheKey)!;
}

/**
 * Build search query string for GitHub API from parameters
 */
function buildCodeSearchQuery(params: GitHubCodeSearchQuery): string {
  const queryParts: string[] = [];

  // Add main search terms
  if (params.queryTerms && params.queryTerms.length > 0) {
    queryParts.push(...params.queryTerms);
  }

  // GitHub API allows searches with just filters, so we don't require queryTerms
  // If no queryTerms provided, we can still search with filters like language:, repo:, etc.

  // Add filters as qualifiers
  if (params.language) {
    queryParts.push(`language:${params.language}`);
  }

  // Repository filters - prioritize specific repo, then owner, then user/org
  if (params.owner && params.repo) {
    const owner = Array.isArray(params.owner) ? params.owner[0] : params.owner;
    const repo = Array.isArray(params.repo) ? params.repo[0] : params.repo;
    queryParts.push(`repo:${owner}/${repo}`);
  } else if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => queryParts.push(`user:${owner}`));
  } else {
    // Handle specific user vs org distinction
    if (params.user) {
      const users = Array.isArray(params.user) ? params.user : [params.user];
      users.forEach(user => queryParts.push(`user:${user}`));
    }
    if (params.org) {
      const orgs = Array.isArray(params.org) ? params.org : [params.org];
      orgs.forEach(org => queryParts.push(`org:${org}`));
    }
  }

  if (params.filename) {
    queryParts.push(`filename:${params.filename}`);
  }

  if (params.extension) {
    queryParts.push(`extension:${params.extension}`);
  }

  if (params.path) {
    queryParts.push(`path:${params.path}`);
  }

  if (params.size) {
    queryParts.push(`size:${params.size}`);
  }

  // Fork handling
  if (params.fork) {
    queryParts.push(`fork:${params.fork}`);
  }

  // Archived handling
  if (params.archived !== undefined) {
    queryParts.push(`archived:${params.archived}`);
  }

  if (params.match) {
    const matches = Array.isArray(params.match) ? params.match : [params.match];
    matches.forEach(match => {
      if (match === 'file') {
        queryParts.push('in:file');
      } else if (match === 'path') {
        queryParts.push('in:path');
      }
    });
  }

  return queryParts.join(' ');
}

/**
 * Build search query string for repository search
 */
function buildRepoSearchQuery(params: GitHubReposSearchParams): string {
  const queryParts: string[] = [];

  // Add main search terms
  if (params.queryTerms && params.queryTerms.length > 0) {
    queryParts.push(...params.queryTerms);
  }

  if (params.exactQuery) {
    queryParts.push(`"${params.exactQuery}"`);
  }

  // Add filters as qualifiers
  if (params.language) {
    queryParts.push(`language:${params.language}`);
  }

  if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => queryParts.push(`user:${owner}`));
  }

  if (params.topic) {
    const topics = Array.isArray(params.topic) ? params.topic : [params.topic];
    topics.forEach(topic => queryParts.push(`topic:${topic}`));
  }

  if (params.stars) {
    queryParts.push(`stars:${params.stars}`);
  }

  if (params.forks) {
    queryParts.push(`forks:${params.forks}`);
  }

  if (params.size) {
    queryParts.push(`size:${params.size}`);
  }

  if (params.created) {
    queryParts.push(`created:${params.created}`);
  }

  if (params.updated) {
    queryParts.push(`pushed:${params.updated}`);
  }

  if (params.archived !== undefined) {
    queryParts.push(`archived:${params.archived}`);
  }

  if (params['include-forks']) {
    if (params['include-forks'] === 'only') {
      queryParts.push('fork:only');
    } else if (params['include-forks'] === 'true') {
      queryParts.push('fork:true');
    } else {
      queryParts.push('fork:false');
    }
  }

  if (params.license) {
    const licenses = Array.isArray(params.license)
      ? params.license
      : [params.license];
    licenses.forEach(license => queryParts.push(`license:${license}`));
  }

  if (params['good-first-issues']) {
    queryParts.push(`good-first-issues:${params['good-first-issues']}`);
  }

  if (params['help-wanted-issues']) {
    queryParts.push(`help-wanted-issues:${params['help-wanted-issues']}`);
  }

  if (params.followers) {
    queryParts.push(`followers:${params.followers}`);
  }

  if (params['number-topics']) {
    queryParts.push(`topics:${params['number-topics']}`);
  }

  if (params.match) {
    const matches = Array.isArray(params.match) ? params.match : [params.match];
    matches.forEach(match => {
      if (match === 'name') {
        queryParts.push('in:name');
      } else if (match === 'description') {
        queryParts.push('in:description');
      } else if (match === 'readme') {
        queryParts.push('in:readme');
      }
    });
  }

  return queryParts.join(' ');
}

/**
 * Enhanced error handling following GitHub CLI patterns
 * Provides detailed error information with scope suggestions and proper typing
 */
function handleGitHubAPIError(error: unknown): GitHubAPIError {
  if (error instanceof RequestError) {
    const { status, message, response } = error;

    switch (status) {
      case 401:
        return {
          error: 'GitHub authentication required',
          status,
          type: 'http',
          scopesSuggestion: 'Set GITHUB_TOKEN or GH_TOKEN environment variable',
        };
      case 403: {
        const remaining = response?.headers?.['x-ratelimit-remaining'];
        const reset = response?.headers?.['x-ratelimit-reset'];
        const acceptedScopes = response?.headers?.['x-accepted-oauth-scopes'];
        const tokenScopes = response?.headers?.['x-oauth-scopes'];

        if (remaining === '0') {
          const resetTime = reset ? new Date(parseInt(reset) * 1000) : null;
          return {
            error: 'GitHub API rate limit exceeded',
            status,
            type: 'http',
            rateLimitRemaining: 0,
            rateLimitReset: resetTime ? resetTime.getTime() : undefined,
            retryAfter: resetTime
              ? Math.ceil((resetTime.getTime() - Date.now()) / 1000)
              : 3600,
            scopesSuggestion:
              'Set GITHUB_TOKEN for higher rate limits (5000/hour vs 60/hour)',
          };
        }

        // Generate scope suggestions following GitHub CLI pattern
        let scopesSuggestion = 'Check repository permissions or authentication';
        if (acceptedScopes && tokenScopes) {
          scopesSuggestion = generateScopesSuggestion(
            String(acceptedScopes),
            String(tokenScopes)
          );
        }

        return {
          error: 'Access forbidden - insufficient permissions',
          status,
          type: 'http',
          scopesSuggestion,
        };
      }
      case 422:
        return {
          error: 'Invalid search query or request parameters',
          status,
          type: 'http',
          scopesSuggestion: 'Check search syntax and parameter values',
        };
      case 404:
        return {
          error: 'Repository, resource, or path not found',
          status,
          type: 'http',
        };
      case 502:
      case 503:
      case 504:
        return {
          error: 'GitHub API temporarily unavailable',
          status,
          type: 'network',
          scopesSuggestion: 'Retry the request after a short delay',
        };
      default:
        return {
          error: message || 'GitHub API request failed',
          status,
          type: 'http',
        };
    }
  }

  // Handle network errors
  if (error instanceof Error) {
    if (
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ECONNREFUSED')
    ) {
      return {
        error: 'Network connection failed',
        type: 'network',
        scopesSuggestion: 'Check internet connection and GitHub API status',
      };
    }
    if (error.message.includes('timeout')) {
      return {
        error: 'Request timeout',
        type: 'network',
        scopesSuggestion: 'Retry the request or check network connectivity',
      };
    }
  }

  return {
    error: error instanceof Error ? error.message : 'Unknown error occurred',
    type: 'unknown',
  };
}

/**
 * Generate scope suggestions following GitHub CLI patterns
 */
function generateScopesSuggestion(
  acceptedScopes: string,
  tokenScopes: string
): string {
  const accepted = acceptedScopes
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const current = tokenScopes
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const missing = accepted.filter(scope => !current.includes(scope));

  if (missing.length > 0) {
    const scopeList = missing.join(', ');
    return `Missing required scopes: ${scopeList}. Run: gh auth refresh -s ${missing.join(' -s ')}`;
  }

  return 'Token may not have sufficient permissions for this operation';
}

/**
 * Convert Octokit code search result to our format with proper typing
 */
async function convertCodeSearchResult(
  octokitResult: SearchCodeResponse,
  minify: boolean = true,
  sanitize: boolean = true
): Promise<OptimizedCodeSearchResult> {
  const items: GitHubCodeSearchItem[] = octokitResult.data.items.map(
    (item: any) => ({
      path: item.path,
      repository: {
        id: item.repository.id.toString(),
        nameWithOwner: item.repository.full_name,
        url: item.repository.html_url,
        isFork: item.repository.fork,
        isPrivate: item.repository.private,
      },
      sha: item.sha,
      url: item.html_url,
      textMatches:
        item.text_matches?.map((match: TextMatch) => ({
          fragment: match.fragment,
          matches:
            match.matches?.map((m: any) => ({
              text: m.text,
              indices: m.indices as [number, number],
            })) || [],
        })) || [],
    })
  );

  return transformToOptimizedFormat(items, minify, sanitize);
}

/**
 * Transform GitHub API response to optimized format with enhanced metadata
 */
async function transformToOptimizedFormat(
  items: GitHubCodeSearchItem[],
  minify: boolean,
  sanitize: boolean
): Promise<OptimizedCodeSearchResult> {
  // Extract repository info if single repo search
  const singleRepo = extractSingleRepository(items);

  // Track security warnings and minification metadata
  const allSecurityWarningsSet = new Set<string>();
  let hasMinificationFailures = false;
  const minificationTypes: string[] = [];

  // Extract packages and dependencies from code matches
  const foundPackages = new Set<string>();
  const foundFiles = new Set<string>();

  const optimizedItems = await Promise.all(
    items.map(async item => {
      // Track found files for deeper research
      foundFiles.add(item.path);

      const processedMatches = await Promise.all(
        (item.textMatches || []).map(async match => {
          let processedFragment = match.fragment;

          // Apply sanitization first if enabled
          if (sanitize) {
            const sanitizationResult =
              ContentSanitizer.sanitizeContent(processedFragment);
            processedFragment = sanitizationResult.content;

            // Collect security warnings
            if (sanitizationResult.hasSecrets) {
              allSecurityWarningsSet.add(
                `Secrets detected in ${item.path}: ${sanitizationResult.secretsDetected.join(', ')}`
              );
            }
            if (sanitizationResult.hasPromptInjection) {
              allSecurityWarningsSet.add(
                `Prompt injection detected in ${item.path}`
              );
            }
            if (sanitizationResult.isMalicious) {
              allSecurityWarningsSet.add(
                `Malicious content detected in ${item.path}`
              );
            }
            if (sanitizationResult.warnings.length > 0) {
              sanitizationResult.warnings.forEach(w =>
                allSecurityWarningsSet.add(`${item.path}: ${w}`)
              );
            }
          }

          // Apply minification if enabled
          if (minify) {
            const minifyResult = await minifyContentV2(
              processedFragment,
              item.path
            );
            processedFragment = minifyResult.content;

            if (minifyResult.failed) {
              hasMinificationFailures = true;
            } else if (minifyResult.type !== 'failed') {
              minificationTypes.push(minifyResult.type);
            }
          }

          return {
            context: processedFragment,
            positions:
              match.matches?.map(m =>
                Array.isArray(m.indices) && m.indices.length >= 2
                  ? ([m.indices[0], m.indices[1]] as [number, number])
                  : ([0, 0] as [number, number])
              ) || [],
          };
        })
      );

      return {
        path: item.path,
        matches: processedMatches,
        url: singleRepo ? item.path : item.url,
        repository: {
          nameWithOwner: item.repository.nameWithOwner,
          url: item.repository.url,
        },
      };
    })
  );

  const result: OptimizedCodeSearchResult = {
    items: optimizedItems,
    total_count: items.length,
    // Add research context for smart hints
    _researchContext: {
      foundPackages: Array.from(foundPackages),
      foundFiles: Array.from(foundFiles),
      repositoryContext: singleRepo
        ? {
            owner: singleRepo.nameWithOwner.split('/')[0],
            repo: singleRepo.nameWithOwner.split('/')[1],
          }
        : undefined,
    },
  };

  // Add repository info if single repo
  if (singleRepo) {
    result.repository = {
      name: singleRepo.nameWithOwner,
      url: singleRepo.url,
    };
  }

  // Add processing metadata
  if (sanitize && allSecurityWarningsSet.size > 0) {
    result.securityWarnings = Array.from(allSecurityWarningsSet);
  }

  if (minify) {
    result.minified = !hasMinificationFailures;
    result.minificationFailed = hasMinificationFailures;
    if (minificationTypes.length > 0) {
      result.minificationTypes = Array.from(new Set(minificationTypes));
    }
  }

  return result;
}

/**
 * Extract single repository if all results are from same repo
 */
function extractSingleRepository(items: GitHubCodeSearchItem[]) {
  if (items.length === 0) return null;

  const firstRepo = items[0].repository;
  const allSameRepo = items.every(
    item => item.repository.nameWithOwner === firstRepo.nameWithOwner
  );

  return allSameRepo ? firstRepo : null;
}

/**
 * Search GitHub pull requests using Octokit API
 * Implementation based on GitHub CLI source code research
 */
export async function searchGitHubPullRequestsAPI(
  params: GitHubPullRequestsSearchParams,
  token?: string
): Promise<GitHubPullRequestSearchResult | GitHubPullRequestSearchError> {
  try {
    const octokit = getOctokit(token);

    // Decide between search and list based on filters (like GitHub CLI does)
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
        params.sort === 'created'
          ? 'created'
          : params.sort === 'updated'
            ? 'updated'
            : params.sort === 'comments'
              ? 'comments'
              : params.sort === 'reactions'
                ? 'reactions'
                : undefined,
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
 * Determine if we should use search API vs list API (based on GitHub CLI logic)
 */
function shouldUseSearchForPRs(
  params: GitHubPullRequestsSearchParams
): boolean {
  // Use search if we have complex filters (like GitHub CLI does)
  return (
    params.draft !== undefined ||
    params.author !== undefined ||
    params.assignee !== undefined ||
    params.query !== undefined ||
    (params.label && params.label.length > 0) ||
    params.mentions !== undefined ||
    params.commenter !== undefined ||
    params.involves !== undefined ||
    params['reviewed-by'] !== undefined ||
    params['review-requested'] !== undefined ||
    params.review !== undefined ||
    params.checks !== undefined ||
    params.reactions !== undefined ||
    params.comments !== undefined ||
    params.interactions !== undefined ||
    params.milestone !== undefined ||
    params.project !== undefined ||
    params['team-mentions'] !== undefined ||
    params['no-assignee'] !== undefined ||
    params['no-label'] !== undefined ||
    params['no-milestone'] !== undefined ||
    params['no-project'] !== undefined ||
    params.language !== undefined ||
    params.visibility !== undefined ||
    params.archived !== undefined ||
    params.app !== undefined ||
    params.created !== undefined ||
    params.updated !== undefined ||
    params['merged-at'] !== undefined ||
    params.closed !== undefined ||
    params.merged !== undefined ||
    params.locked !== undefined ||
    Array.isArray(params.owner) ||
    Array.isArray(params.repo)
  );
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
      sort:
        params.sort === 'created'
          ? 'created'
          : params.sort === 'updated'
            ? 'updated'
            : 'created',
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
async function transformPullRequestItemFromREST(
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
 * Build pull request search query string for GitHub API
 * Based on GitHub CLI's query building logic
 */
function buildPullRequestSearchQuery(
  params: GitHubPullRequestsSearchParams
): string {
  const queryParts: string[] = [];

  // Add main query if provided (keywords)
  if (params.query && params.query.trim()) {
    queryParts.push(params.query.trim());
  }

  // Always add is:pr to ensure we only get pull requests (like GitHub CLI)
  queryParts.push('is:pr');

  // Repository filters - handle arrays properly
  if (params.owner && params.repo) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];

    // Create repo combinations (like GitHub CLI)
    owners.forEach(owner => {
      repos.forEach(repo => {
        queryParts.push(`repo:${owner}/${repo}`);
      });
    });
  } else if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => {
      queryParts.push(`user:${owner}`);
    });
  }

  // State filters (following GitHub CLI patterns)
  if (params.state) {
    queryParts.push(`is:${params.state}`);
  }
  if (params.draft !== undefined) {
    queryParts.push(params.draft ? 'is:draft' : '-is:draft');
  }
  if (params.merged !== undefined) {
    queryParts.push(params.merged ? 'is:merged' : 'is:unmerged');
  }
  if (params.locked !== undefined) {
    queryParts.push(params.locked ? 'is:locked' : '-is:locked');
  }

  // User involvement filters
  if (params.author) {
    queryParts.push(`author:${params.author}`);
  }
  if (params.assignee) {
    queryParts.push(`assignee:${params.assignee}`);
  }
  if (params.mentions) {
    queryParts.push(`mentions:${params.mentions}`);
  }
  if (params.commenter) {
    queryParts.push(`commenter:${params.commenter}`);
  }
  if (params.involves) {
    queryParts.push(`involves:${params.involves}`);
  }
  if (params['reviewed-by']) {
    queryParts.push(`reviewed-by:${params['reviewed-by']}`);
  }
  if (params['review-requested']) {
    queryParts.push(`review-requested:${params['review-requested']}`);
  }

  // Branch filters
  if (params.head) {
    queryParts.push(`head:${params.head}`);
  }
  if (params.base) {
    queryParts.push(`base:${params.base}`);
  }

  // Date filters
  if (params.created) {
    queryParts.push(`created:${params.created}`);
  }
  if (params.updated) {
    queryParts.push(`updated:${params.updated}`);
  }
  if (params['merged-at']) {
    queryParts.push(`merged:${params['merged-at']}`);
  }
  if (params.closed) {
    queryParts.push(`closed:${params.closed}`);
  }

  // Engagement filters
  if (params.comments !== undefined) {
    queryParts.push(`comments:${params.comments}`);
  }
  if (params.reactions !== undefined) {
    queryParts.push(`reactions:${params.reactions}`);
  }
  if (params.interactions !== undefined) {
    queryParts.push(`interactions:${params.interactions}`);
  }

  // Review and CI filters
  if (params.review) {
    queryParts.push(`review:${params.review}`);
  }
  if (params.checks) {
    queryParts.push(`status:${params.checks}`);
  }

  // Label filters (handle arrays)
  if (params.label) {
    const labels = Array.isArray(params.label) ? params.label : [params.label];
    labels.forEach(label => {
      queryParts.push(`label:"${label}"`);
    });
  }

  // Organization filters
  if (params.milestone) {
    queryParts.push(`milestone:"${params.milestone}"`);
  }
  if (params['team-mentions']) {
    queryParts.push(`team:${params['team-mentions']}`);
  }
  if (params.project) {
    queryParts.push(`project:${params.project}`);
  }
  if (params.app) {
    queryParts.push(`app:${params.app}`);
  }

  // Boolean "missing" filters (like GitHub CLI's "no:" qualifiers)
  if (params['no-assignee']) {
    queryParts.push('no:assignee');
  }
  if (params['no-label']) {
    queryParts.push('no:label');
  }
  if (params['no-milestone']) {
    queryParts.push('no:milestone');
  }
  if (params['no-project']) {
    queryParts.push('no:project');
  }

  // Language filter
  if (params.language) {
    queryParts.push(`language:${params.language}`);
  }

  // Visibility filter (handle arrays)
  if (params.visibility) {
    const visibilities = Array.isArray(params.visibility)
      ? params.visibility
      : [params.visibility];
    visibilities.forEach(vis => {
      queryParts.push(`is:${vis}`);
    });
  }

  // Archived filter
  if (params.archived !== undefined) {
    queryParts.push(params.archived ? 'archived:true' : 'archived:false');
  }

  return queryParts.join(' ').trim();
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

          // Sanitize commit message
          const messageSanitized = ContentSanitizer.sanitizeContent(
            commit.commit?.message || ''
          );
          const commitWarningsSet = new Set<string>(messageSanitized.warnings);

          return {
            sha: commit.sha,
            message: messageSanitized.content,
            author:
              commit.author?.login || commit.commit?.author?.name || 'Unknown',
            url: commit.html_url,
            authoredDate: commit.commit?.author?.date,
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
          // If we can't fetch commit details, return basic info
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
 * Search GitHub issues using Octokit API
 */
export async function searchGitHubIssuesAPI(
  params: GitHubIssuesSearchParams,
  token?: string
): Promise<GitHubIssueSearchResult | GitHubIssueSearchError> {
  try {
    const octokit = getOctokit(token);

    // Build search query
    const searchQuery = buildIssueSearchQuery(params);

    if (!searchQuery) {
      return {
        error: 'No valid search parameters provided',
        hints: [
          'Add search query OR filters',
          'Try specific repo: --owner owner --repo repo',
        ],
      };
    }

    // Execute search using GitHub Search API
    const searchResult = await octokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
      sort:
        params.sort === 'created'
          ? 'created'
          : params.sort === 'updated'
            ? 'updated'
            : params.sort === 'comments'
              ? 'comments'
              : params.sort === 'reactions'
                ? 'reactions'
                : undefined,
      order: params.order || 'desc',
      per_page: Math.min(params.limit || 25, 100),
    });

    // Filter out pull requests unless explicitly requested
    const issues =
      searchResult.data.items?.filter((item: any) =>
        params['include-prs'] ? true : !item.pull_request
      ) || [];

    // Transform issues to match our schema format
    const transformedIssues = issues.map((item: any) => {
      return {
        id: item.id,
        number: item.number,
        title: item.title || '',
        url: item.url,
        html_url: item.html_url,
        repository_url: item.repository_url,
        labels_url: item.labels_url,
        comments_url: item.comments_url,
        events_url: item.events_url,
        state: item.state,
        state_reason: item.state_reason,
        created_at: item.created_at,
        updated_at: item.updated_at,
        closed_at: item.closed_at,
        body: item.body,
        user: {
          login: item.user?.login || '',
          id: item.user?.id || 0,
          avatar_url: item.user?.avatar_url || '',
          html_url: item.user?.html_url || '',
          type: item.user?.type || '',
        },
        assignee: item.assignee
          ? {
              login: item.assignee.login,
              id: item.assignee.id,
              avatar_url: item.assignee.avatar_url,
              html_url: item.assignee.html_url,
              type: item.assignee.type,
            }
          : null,
        assignees:
          item.assignees?.map((a: any) => ({
            login: a.login,
            id: a.id,
            avatar_url: a.avatar_url,
            html_url: a.html_url,
            type: a.type,
          })) || [],
        labels:
          item.labels?.map((l: any) => ({
            id: l.id,
            name: l.name,
            color: l.color,
            description: l.description,
            default: l.default,
          })) || [],
        milestone: item.milestone
          ? {
              id: item.milestone.id,
              number: item.milestone.number,
              title: item.milestone.title,
              description: item.milestone.description,
              state: item.milestone.state,
              created_at: item.milestone.created_at,
              updated_at: item.milestone.updated_at,
              due_on: item.milestone.due_on,
              closed_at: item.milestone.closed_at,
            }
          : null,
        locked: item.locked,
        active_lock_reason: item.active_lock_reason,
        comments: item.comments,
        reactions: {
          '+1': item.reactions?.['+1'] || 0,
          '-1': item.reactions?.['-1'] || 0,
          laugh: item.reactions?.laugh || 0,
          hooray: item.reactions?.hooray || 0,
          confused: item.reactions?.confused || 0,
          heart: item.reactions?.heart || 0,
          rocket: item.reactions?.rocket || 0,
          eyes: item.reactions?.eyes || 0,
          total_count: item.reactions?.total_count || 0,
          url: item.reactions?.url || '',
        },
        repository: item.repository
          ? {
              id: item.repository.id,
              name: item.repository.name,
              full_name: item.repository.full_name,
              owner: {
                login: item.repository.owner.login,
                id: item.repository.owner.id,
                type: item.repository.owner.type,
              },
              private: item.repository.private,
              html_url: item.repository.html_url,
              description: item.repository.description,
              fork: item.repository.fork,
              language: item.repository.language,
              stargazers_count: item.repository.stargazers_count,
              watchers_count: item.repository.watchers_count,
              forks_count: item.repository.forks_count,
              open_issues_count: item.repository.open_issues_count,
              default_branch: item.repository.default_branch,
            }
          : undefined,
        score: item.score,
        pull_request: item.pull_request
          ? {
              url: item.pull_request.url,
              html_url: item.pull_request.html_url,
              diff_url: item.pull_request.diff_url,
              patch_url: item.pull_request.patch_url,
              merged_at: item.pull_request.merged_at,
            }
          : undefined,
      };
    });

    return {
      total_count: searchResult.data.total_count,
      incomplete_results: searchResult.data.incomplete_results,
      issues: transformedIssues as any,
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    return {
      error: `Issue search failed: ${apiError.error}`,
      status: apiError.status,
      hints: [
        'Check if repository exists and is accessible',
        'Verify search parameters are valid',
        'Try simpler search terms',
      ],
      rateLimitRemaining: apiError.rateLimitRemaining,
      rateLimitReset: apiError.rateLimitReset,
      type: apiError.type || 'unknown',
    };
  }
}

/**
 * Build issue search query string for GitHub API
 */
function buildIssueSearchQuery(params: GitHubIssuesSearchParams): string {
  const queryParts: string[] = [];

  // Add main query
  if (params.query && params.query.trim()) {
    queryParts.push(params.query.trim());
  }

  // Always add is:issue unless including PRs
  if (!params['include-prs']) {
    queryParts.push('is:issue');
  }

  // Repository filters
  if (params.owner && params.repo) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => {
      queryParts.push(`repo:${owner}/${params.repo}`);
    });
  } else if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => {
      queryParts.push(`user:${owner}`);
    });
  }

  // State filters
  if (params.state) {
    queryParts.push(`is:${params.state}`);
  }
  if (params.locked !== undefined) {
    queryParts.push(params.locked ? 'is:locked' : '-is:locked');
  }

  // User involvement filters
  if (params.author) {
    queryParts.push(`author:${params.author}`);
  }
  if (params.assignee) {
    queryParts.push(`assignee:${params.assignee}`);
  }
  if (params.mentions) {
    queryParts.push(`mentions:${params.mentions}`);
  }
  if (params.commenter) {
    queryParts.push(`commenter:${params.commenter}`);
  }
  if (params.involves) {
    queryParts.push(`involves:${params.involves}`);
  }

  // Date filters
  if (params.created) {
    queryParts.push(`created:${params.created}`);
  }
  if (params.updated) {
    queryParts.push(`updated:${params.updated}`);
  }
  if (params.closed) {
    queryParts.push(`closed:${params.closed}`);
  }

  // Engagement filters
  if (params.comments !== undefined) {
    queryParts.push(`comments:${params.comments}`);
  }
  if (params.reactions !== undefined) {
    queryParts.push(`reactions:${params.reactions}`);
  }
  if (params.interactions !== undefined) {
    queryParts.push(`interactions:${params.interactions}`);
  }

  // Label filters
  if (params.label) {
    const labels = Array.isArray(params.label) ? params.label : [params.label];
    labels.forEach(label => {
      queryParts.push(`label:"${label}"`);
    });
  }

  // Organization filters
  if (params.milestone) {
    queryParts.push(`milestone:"${params.milestone}"`);
  }
  if (params['team-mentions']) {
    queryParts.push(`team:${params['team-mentions']}`);
  }

  // Boolean "missing" filters
  if (params['no-assignee']) {
    queryParts.push('no:assignee');
  }
  if (params['no-label']) {
    queryParts.push('no:label');
  }
  if (params['no-milestone']) {
    queryParts.push('no:milestone');
  }
  if (params['no-project']) {
    queryParts.push('no:project');
  }

  // Language filter
  if (params.language) {
    queryParts.push(`language:${params.language}`);
  }

  // Visibility filter
  if (params.visibility) {
    queryParts.push(`is:${params.visibility}`);
  }

  // App filter
  if (params.app) {
    queryParts.push(`app:${params.app}`);
  }

  // Archived filter
  if (params.archived !== undefined) {
    queryParts.push(params.archived ? 'is:archived' : '-is:archived');
  }

  return queryParts.join(' ').trim();
}

/**
 * Search GitHub code using Octokit API with proper TypeScript types
 */
export async function searchGitHubCodeAPI(
  params: GitHubCodeSearchQuery,
  token?: string
): Promise<OptimizedCodeSearchResult | GitHubAPIError> {
  try {
    const octokit = getOctokit(token);
    const query = buildCodeSearchQuery(params);

    if (!query.trim()) {
      return {
        error: 'Search query cannot be empty',
        type: 'http',
        status: 400,
      };
    }

    const searchParams: SearchCodeParameters = {
      q: query,
      per_page: Math.min(params.limit || 30, 100),
      page: 1,
    };

    // GitHub API code search supports 'indexed' sort and 'asc'/'desc' order
    // But these are not commonly used, so we'll skip them for now

    const result = await octokit.rest.search.code({
      ...searchParams,
      headers: {
        Accept: 'application/vnd.github.v3.text-match+json',
      },
    });
    const optimizedResult = await convertCodeSearchResult(
      result,
      params.minify !== false,
      params.sanitize !== false
    );

    return {
      total_count: result.data.total_count,
      items: optimizedResult.items,
      repository: optimizedResult.repository,
      securityWarnings: optimizedResult.securityWarnings,
      minified: optimizedResult.minified,
      minificationFailed: optimizedResult.minificationFailed,
      minificationTypes: optimizedResult.minificationTypes,
      _researchContext: optimizedResult._researchContext,
    };
  } catch (error: unknown) {
    return handleGitHubAPIError(error);
  }
}

/**
 * Search GitHub repositories using Octokit API with proper TypeScript types
 */
export async function searchGitHubReposAPI(
  params: GitHubReposSearchParams,
  token?: string
): Promise<GitHubReposSearchResult | GitHubAPIError> {
  try {
    const octokit = getOctokit(token);
    const query = buildRepoSearchQuery(params);

    if (!query.trim()) {
      return {
        error:
          'Search query cannot be empty. Provide queryTerms, exactQuery, or filters.',
        type: 'http',
        status: 400,
      };
    }

    // Use properly typed parameters
    const searchParams: SearchReposParameters = {
      q: query,
      per_page: Math.min(params.limit || 30, 100),
      page: 1,
    };

    // Add sort and order if specified
    if (params.sort && params.sort !== 'best-match') {
      searchParams.sort = params.sort as SearchReposParameters['sort'];
    }
    if (params.order) {
      searchParams.order = params.order as SearchReposParameters['order'];
    }

    const result = await octokit.rest.search.repos(searchParams);

    // Transform repository results to match CLI format with proper typing
    const repositories = result.data.items.map((repo: any) => ({
      name: repo.full_name,
      stars: repo.stargazers_count || 0,
      description: repo.description
        ? repo.description.length > 150
          ? repo.description.substring(0, 150) + '...'
          : repo.description
        : 'No description',
      language: repo.language || 'Unknown',
      url: repo.html_url,
      forks: repo.forks_count || 0,
      updatedAt: new Date(repo.updated_at).toLocaleDateString('en-GB'),
      owner: repo.owner.login,
    }));

    return {
      total_count: result.data.total_count,
      repositories,
    };
  } catch (error: unknown) {
    return handleGitHubAPIError(error);
  }
}

/**
 * Fetch GitHub file content using Octokit API with proper TypeScript types
 */
export async function fetchGitHubFileContentAPI(
  params: GithubFetchRequestParams,
  token?: string
): Promise<GitHubFileContentResponse | GitHubFileContentError> {
  try {
    const octokit = getOctokit(token);
    const { owner, repo, filePath, branch } = params;

    // Use properly typed parameters
    const contentParams: GetContentParameters = {
      owner,
      repo,
      path: filePath,
      ...(branch && { ref: branch }),
    };

    const result = await octokit.rest.repos.getContent(contentParams);

    // Handle the response data
    const data = result.data;

    // Check if it's a directory (array response)
    if (Array.isArray(data)) {
      return {
        error:
          'Path is a directory. Use githubViewRepoStructure to list directory contents',
        hints: [
          'Path is a directory. Use githubViewRepoStructure to list directory contents',
        ],
      };
    }

    // Check if it's a file with content
    if ('content' in data && data.type === 'file') {
      const fileSize = data.size || 0;
      const MAX_FILE_SIZE = 300 * 1024; // 300KB limit

      // Check file size
      if (fileSize > MAX_FILE_SIZE) {
        const fileSizeKB = Math.round(fileSize / 1024);
        const maxSizeKB = Math.round(MAX_FILE_SIZE / 1024);

        return {
          error: `File too large (${fileSizeKB}KB > ${maxSizeKB}KB). Use githubSearchCode to search within the file or use startLine/endLine parameters to get specific sections`,
          hints: [
            `File too large (${fileSizeKB}KB > ${maxSizeKB}KB). Use githubSearchCode to search within the file or use startLine/endLine parameters to get specific sections`,
          ],
        };
      }

      // Get and decode content
      if (!data.content) {
        return {
          error: 'File is empty - no content to display',
          hints: ['File is empty - no content to display'],
        };
      }

      const base64Content = data.content.replace(/\s/g, ''); // Remove all whitespace

      if (!base64Content) {
        return {
          error: 'File is empty - no content to display',
          hints: ['File is empty - no content to display'],
        };
      }

      let decodedContent: string;
      try {
        const buffer = Buffer.from(base64Content, 'base64');

        // Simple binary check - look for null bytes
        if (buffer.indexOf(0) !== -1) {
          return {
            error:
              'Binary file detected. Cannot display as text - download directly from GitHub',
            hints: [
              'Binary file detected. Cannot display as text - download directly from GitHub',
            ],
          };
        }

        decodedContent = buffer.toString('utf-8');
      } catch (decodeError) {
        return {
          error:
            'Failed to decode file. Encoding may not be supported (expected UTF-8)',
          hints: [
            'Failed to decode file. Encoding may not be supported (expected UTF-8)',
          ],
        };
      }

      // Process the content similar to CLI implementation
      return await processFileContentAPI(
        decodedContent,
        owner,
        repo,
        branch || data.sha,
        filePath,
        params.minified !== false,
        params.startLine,
        params.endLine,
        params.contextLines || 5,
        params.matchString
      );
    }

    // Handle other file types (symlinks, submodules, etc.)
    return {
      error: `Unsupported file type: ${data.type}`,
      hints: [`Unsupported file type: ${data.type}`],
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    const hints: string[] = [apiError.error];

    // Add scope suggestion if available
    if (apiError.scopesSuggestion) {
      hints.push(apiError.scopesSuggestion);
    }

    // Add specific hints based on error type
    switch (apiError.status) {
      case 403:
        if (apiError.rateLimitRemaining === 0) {
          hints.push(`Retry after ${apiError.retryAfter} seconds.`);
        }
        break;
      case 404:
        hints.push('Verify the file path, repository name, and branch exist.');
        break;
    }

    return {
      error: apiError.error,
      status: apiError.status,
      type: apiError.type,
      hints,
      scopesSuggestion: apiError.scopesSuggestion,
      rateLimitRemaining: apiError.rateLimitRemaining,
      rateLimitReset: apiError.rateLimitReset,
    };
  }
}

/**
 * Process file content from API with similar functionality to CLI implementation
 */
async function processFileContentAPI(
  decodedContent: string,
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  minified: boolean,
  startLine?: number,
  endLine?: number,
  contextLines: number = 5,
  matchString?: string
): Promise<GitHubFileContentResponse | GitHubFileContentError> {
  // Sanitize the decoded content for security
  const sanitizationResult = ContentSanitizer.sanitizeContent(decodedContent);
  decodedContent = sanitizationResult.content;

  // Add security warnings to the response if any issues were found
  const securityWarningsSet = new Set<string>();
  if (sanitizationResult.hasSecrets) {
    securityWarningsSet.add(
      `Secrets detected and redacted: ${sanitizationResult.secretsDetected.join(', ')}`
    );
  }
  if (sanitizationResult.hasPromptInjection) {
    securityWarningsSet.add(
      'Potential prompt injection detected and sanitized'
    );
  }
  if (sanitizationResult.isMalicious) {
    securityWarningsSet.add(
      'Potentially malicious content detected and sanitized'
    );
  }
  if (sanitizationResult.warnings.length > 0) {
    sanitizationResult.warnings.forEach(warning =>
      securityWarningsSet.add(warning)
    );
  }
  const securityWarnings = Array.from(securityWarningsSet);

  // Handle partial file access
  let finalContent = decodedContent;
  let actualStartLine: number | undefined;
  let actualEndLine: number | undefined;
  let isPartial = false;
  let hasLineAnnotations = false;

  // Always calculate total lines for metadata
  const lines = decodedContent.split('\n');
  const totalLines = lines.length;

  // SMART MATCH FINDER: If matchString is provided, find it and set line range
  if (matchString) {
    const matchingLines: number[] = [];

    // Find all lines that contain the match string
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(matchString)) {
        matchingLines.push(i + 1); // Convert to 1-based line numbers
      }
    }

    if (matchingLines.length === 0) {
      return {
        error: `Match string "${matchString}" not found in file. The file may have changed since the search was performed.`,
        hints: [
          `Match string "${matchString}" not found in file. The file may have changed since the search was performed.`,
        ],
      };
    }

    // Use the first match, with context lines around it
    const firstMatch = matchingLines[0];
    const matchStartLine = Math.max(1, firstMatch - contextLines);
    const matchEndLine = Math.min(totalLines, firstMatch + contextLines);

    // Override any manually provided startLine/endLine when matchString is used
    startLine = matchStartLine;
    endLine = matchEndLine;

    // Add info about the match for user context
    securityWarnings.push(
      `Found "${matchString}" on line ${firstMatch}${matchingLines.length > 1 ? ` (and ${matchingLines.length - 1} other locations)` : ''}`
    );
  }

  if (startLine !== undefined) {
    // Validate line numbers
    if (startLine < 1 || startLine > totalLines) {
      return {
        error: `Invalid startLine ${startLine}. File has ${totalLines} lines. Use line numbers between 1 and ${totalLines}.`,
        hints: [
          `Invalid startLine ${startLine}. File has ${totalLines} lines. Use line numbers between 1 and ${totalLines}.`,
        ],
      };
    }

    // Calculate actual range with context
    const contextStart = Math.max(1, startLine - contextLines);
    let adjustedEndLine = endLine;

    // Validate and auto-adjust endLine if provided
    if (endLine !== undefined) {
      if (endLine < startLine) {
        return {
          error: `Invalid range: endLine (${endLine}) must be greater than or equal to startLine (${startLine}).`,
          hints: [
            `Invalid range: endLine (${endLine}) must be greater than or equal to startLine (${startLine}).`,
          ],
        };
      }

      // Auto-adjust endLine to file boundaries with helpful message
      if (endLine > totalLines) {
        adjustedEndLine = totalLines;
        securityWarnings.push(
          `Requested endLine ${endLine} adjusted to ${totalLines} (file end)`
        );
      }
    }

    const contextEnd = adjustedEndLine
      ? Math.min(totalLines, adjustedEndLine + contextLines)
      : Math.min(totalLines, startLine + contextLines);

    // Extract the specified range with context from ORIGINAL content
    const selectedLines = lines.slice(contextStart - 1, contextEnd);

    actualStartLine = contextStart;
    actualEndLine = contextEnd;
    isPartial = true;

    // Add line number annotations for partial content
    const annotatedLines = selectedLines.map((line, index) => {
      const lineNumber = contextStart + index;
      const isInTargetRange =
        lineNumber >= startLine &&
        (adjustedEndLine === undefined || lineNumber <= adjustedEndLine);
      const marker = isInTargetRange ? '→' : ' ';
      return `${marker}${lineNumber.toString().padStart(4)}: ${line}`;
    });

    finalContent = annotatedLines.join('\n');
    hasLineAnnotations = true;
  }

  // Apply minification to final content (both partial and full files)
  let minificationFailed = false;
  let minificationType = 'none';

  if (minified) {
    if (hasLineAnnotations) {
      // For partial content with line annotations, extract code content first
      const annotatedLines = finalContent.split('\n');
      const codeLines = annotatedLines.map(line => {
        // Remove line number annotations but preserve the original line content
        const match = line.match(/^[→ ]\s*\d+:\s*(.*)$/);
        return match ? match[1] : line;
      });

      const codeContent = codeLines.join('\n');
      const minifyResult = await minifyContentV2(codeContent, filePath);

      if (!minifyResult.failed) {
        // Apply minification first, then add simple line annotations
        // Since minified content may be much shorter, use a simplified annotation approach
        finalContent = `Lines ${actualStartLine}-${actualEndLine} (minified):\n${minifyResult.content}`;
        minificationType = minifyResult.type;
      } else {
        minificationFailed = true;
      }
    } else {
      // Full file minification
      const minifyResult = await minifyContentV2(finalContent, filePath);
      finalContent = minifyResult.content;
      minificationFailed = minifyResult.failed;
      minificationType = minifyResult.type;
    }
  }

  return createResult({
    data: {
      filePath,
      owner,
      repo,
      branch,
      content: finalContent,
      // Always return total lines for LLM context
      totalLines,
      // Original request parameters for LLM context
      requestedStartLine: startLine,
      requestedEndLine: endLine,
      requestedContextLines: contextLines,
      // Actual content boundaries (only for partial content)
      ...(isPartial && {
        startLine: actualStartLine,
        endLine: actualEndLine,
        isPartial,
      }),
      // Minification metadata
      ...(minified && {
        minified: !minificationFailed,
        minificationFailed: minificationFailed,
        minificationType: minificationType,
      }),
      // Security metadata
      ...(securityWarnings.length > 0 && {
        securityWarnings,
      }),
    } as GitHubFileContentResponse,
  });
}

/**
 * Check GitHub API authentication status with proper typing
 */
export async function checkGitHubAuthAPI(
  token?: string
): Promise<CallToolResult> {
  try {
    const octokit = getOctokit(token);
    const result = await octokit.rest.users.getAuthenticated();

    return createResult({
      data: {
        authenticated: true,
        user: result.data.login,
        name: result.data.name,
        type: result.data.type,
        rateLimit: {
          remaining: result.headers['x-ratelimit-remaining'],
          limit: result.headers['x-ratelimit-limit'],
          reset: result.headers['x-ratelimit-reset'],
        },
      },
    });
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);

    if (apiError.status === 401) {
      return createResult({
        data: {
          authenticated: false,
          message: 'No valid authentication found',
          hint: 'Set GITHUB_TOKEN or GH_TOKEN environment variable',
        },
      });
    }

    return createResult({
      isError: true,
      hints: [`Authentication check failed: ${apiError.error}`],
    });
  }
}

/**
 * View GitHub repository structure using Octokit API
 */
export async function viewGitHubRepositoryStructureAPI(
  params: GitHubRepositoryStructureParams,
  token?: string
): Promise<GitHubRepositoryStructureResult | GitHubRepositoryStructureError> {
  try {
    const octokit = getOctokit(token);
    const {
      owner,
      repo,
      branch,
      path = '',
      depth = 1,
      includeIgnored = false,
      showMedia = false,
    } = params;

    // Clean up path
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;

    // Try to get repository contents
    let result;
    let workingBranch = branch;
    try {
      result = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: cleanPath || undefined,
        ref: branch,
      });
    } catch (error: unknown) {
      // Handle branch/path not found by trying fallbacks
      if (error instanceof RequestError && error.status === 404) {
        // Try to get repository info first to find default branch
        let defaultBranch = 'main';
        try {
          const repoInfo = await octokit.rest.repos.get({ owner, repo });
          defaultBranch = repoInfo.data.default_branch || 'main';
        } catch (repoError) {
          // Repository doesn't exist or no access
          const apiError = handleGitHubAPIError(repoError);
          return {
            error: `Repository "${owner}/${repo}" not found or not accessible: ${apiError.error}`,
            status: apiError.status,
          };
        }

        // Try with default branch if different from requested
        if (defaultBranch !== branch) {
          try {
            result = await octokit.rest.repos.getContent({
              owner,
              repo,
              path: cleanPath || undefined,
              ref: defaultBranch,
            });
            workingBranch = defaultBranch;
          } catch (fallbackError) {
            // Try common branches
            const commonBranches = ['main', 'master', 'develop'];
            let foundBranch = null;

            for (const tryBranch of commonBranches) {
              if (tryBranch === branch || tryBranch === defaultBranch) continue;

              try {
                result = await octokit.rest.repos.getContent({
                  owner,
                  repo,
                  path: cleanPath || undefined,
                  ref: tryBranch,
                });
                foundBranch = tryBranch;
                workingBranch = tryBranch;
                break;
              } catch {
                // Continue trying
              }
            }

            if (!foundBranch) {
              const apiError = handleGitHubAPIError(error);
              return {
                error: `Path "${cleanPath}" not found in repository "${owner}/${repo}" on any common branch`,
                status: apiError.status,
                triedBranches: [branch, defaultBranch, ...commonBranches],
                defaultBranch,
              };
            }
          }
        } else {
          const apiError = handleGitHubAPIError(error);
          return {
            error: `Path "${cleanPath}" not found in repository "${owner}/${repo}" on branch "${branch}"`,
            status: apiError.status,
          };
        }
      } else {
        const apiError = handleGitHubAPIError(error);
        return {
          error: `Failed to access repository "${owner}/${repo}": ${apiError.error}`,
          status: apiError.status,
          rateLimitRemaining: apiError.rateLimitRemaining,
          rateLimitReset: apiError.rateLimitReset,
        };
      }
    }

    // Process the result
    const items = Array.isArray(result.data) ? result.data : [result.data];

    // Convert Octokit response to our GitHubApiFileItem format
    const apiItems: GitHubApiFileItem[] = items.map(
      (item: GitHubApiFileItem) => ({
        name: item.name,
        path: item.path,
        type: item.type as 'file' | 'dir',
        size: 'size' in item ? item.size : undefined,
        download_url: 'download_url' in item ? item.download_url : undefined,
        url: item.url,
        html_url: item.html_url,
        git_url: item.git_url,
        sha: item.sha,
      })
    );

    // If depth > 1, recursively fetch subdirectories
    let allItems = apiItems;
    if (depth > 1) {
      const recursiveItems = await fetchDirectoryContentsRecursivelyAPI(
        octokit,
        owner,
        repo,
        workingBranch,
        cleanPath,
        1,
        depth
      );

      // Combine and deduplicate
      const combinedItems = [...apiItems, ...recursiveItems];
      allItems = combinedItems.filter(
        (item, index, array) =>
          array.findIndex(i => i.path === item.path) === index
      );
    }

    // Apply filtering if needed
    let filteredItems = allItems;
    if (!includeIgnored) {
      // Simple filtering logic - exclude common ignored patterns
      filteredItems = allItems.filter(item => {
        const name = item.name.toLowerCase();
        const path = item.path.toLowerCase();

        // Skip hidden files and directories
        if (name.startsWith('.') && !showMedia) return false;

        // Skip common build/dependency directories
        if (
          [
            'node_modules',
            'dist',
            'build',
            '.git',
            '.vscode',
            '.idea',
          ].includes(name)
        )
          return false;

        // Skip lock files and config files
        if (name.includes('lock') || name.endsWith('.lock')) return false;

        // Skip media files unless requested
        if (!showMedia) {
          const mediaExtensions = [
            '.png',
            '.jpg',
            '.jpeg',
            '.gif',
            '.svg',
            '.ico',
            '.webp',
            '.mp4',
            '.mov',
            '.avi',
          ];
          if (mediaExtensions.some(ext => path.endsWith(ext))) return false;
        }

        return true;
      });
    }

    // Limit items for performance
    const itemLimit = Math.min(200, 50 * depth);
    const limitedItems = filteredItems.slice(0, itemLimit);

    // Sort items: directories first, then by depth, then alphabetically
    limitedItems.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }

      const aDepth = a.path.split('/').length;
      const bDepth = b.path.split('/').length;

      if (aDepth !== bDepth) {
        return aDepth - bDepth;
      }

      return a.path.localeCompare(b.path);
    });

    // Create response structure
    const files = limitedItems
      .filter(item => item.type === 'file')
      .map(item => ({
        name: item.name,
        path: item.path,
        size: item.size,
        depth:
          item.path.split('/').length -
          (cleanPath ? cleanPath.split('/').length : 0),
        url: item.path,
      }));

    const folders = limitedItems
      .filter(item => item.type === 'dir')
      .map(item => ({
        name: item.name,
        path: item.path,
        depth:
          item.path.split('/').length -
          (cleanPath ? cleanPath.split('/').length : 0),
        url: item.path,
      }));

    return {
      repository: `${owner}/${repo}`,
      branch: workingBranch,
      path: cleanPath || '/',
      depth: depth,
      apiSource: true,
      summary: {
        totalFiles: files.length,
        totalFolders: folders.length,
        truncated: allItems.length > limitedItems.length,
        filtered: !includeIgnored,
        originalCount: allItems.length,
      },
      files: {
        count: files.length,
        files: files,
      },
      folders: {
        count: folders.length,
        folders: folders,
      },
    };
  } catch (error: unknown) {
    const apiError = handleGitHubAPIError(error);
    return {
      error: `API request failed: ${apiError.error}`,
      status: apiError.status,
      rateLimitRemaining: apiError.rateLimitRemaining,
      rateLimitReset: apiError.rateLimitReset,
    };
  }
}

/**
 * Recursively fetch directory contents using API
 */
async function fetchDirectoryContentsRecursivelyAPI(
  octokit: InstanceType<typeof OctokitWithThrottling>,
  owner: string,
  repo: string,
  branch: string,
  path: string,
  currentDepth: number,
  maxDepth: number,
  visitedPaths: Set<string> = new Set()
): Promise<GitHubApiFileItem[]> {
  // Prevent infinite loops and respect depth limits
  if (currentDepth > maxDepth || visitedPaths.has(path)) {
    return [];
  }

  visitedPaths.add(path);

  try {
    const result = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: path || undefined,
      ref: branch,
    });

    const items = Array.isArray(result.data) ? result.data : [result.data];
    const apiItems: GitHubApiFileItem[] = items.map(
      (item: GitHubApiFileItem) => ({
        name: item.name,
        path: item.path,
        type: item.type as 'file' | 'dir',
        size: 'size' in item ? item.size : undefined,
        download_url: 'download_url' in item ? item.download_url : undefined,
        url: item.url,
        html_url: item.html_url,
        git_url: item.git_url,
        sha: item.sha,
      })
    );

    const allItems: GitHubApiFileItem[] = [...apiItems];

    // If we haven't reached max depth, recursively fetch subdirectories
    if (currentDepth < maxDepth) {
      const directories = apiItems.filter(item => item.type === 'dir');

      // Limit concurrent requests to avoid rate limits
      const concurrencyLimit = 3;
      for (let i = 0; i < directories.length; i += concurrencyLimit) {
        const batch = directories.slice(i, i + concurrencyLimit);

        const promises = batch.map(async dir => {
          try {
            const subItems = await fetchDirectoryContentsRecursivelyAPI(
              octokit,
              owner,
              repo,
              branch,
              dir.path,
              currentDepth + 1,
              maxDepth,
              new Set(visitedPaths) // Pass a copy to avoid shared state issues
            );
            return subItems;
          } catch (error) {
            // Silently fail on individual directory errors
            return [];
          }
        });

        const results = await Promise.all(promises);
        results.forEach(subItems => {
          allItems.push(...subItems);
        });
      }
    }

    return allItems;
  } catch (error) {
    // Return empty array on error to allow partial results
    return [];
  }
}

/**
 * Search GitHub commits using Octokit API
 * Implementation based on GitHub CLI source code research
 */
export async function searchGitHubCommitsAPI(
  params: GitHubCommitSearchParams,
  token?: string
): Promise<GitHubCommitSearchResult | GitHubCommitSearchError> {
  try {
    const octokit = getOctokit(token);

    // Build search query following GitHub CLI patterns
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
    // GitHub CLI uses max 100 per page and handles pagination internally
    const perPage = Math.min(params.limit || 25, 100);
    let allCommits: GitHubCommitSearchItem[] = [];
    let totalCount = 0;
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage && allCommits.length < (params.limit || 25)) {
      const searchResult = await octokit.rest.search.commits({
        q: searchQuery,
        sort: params.sort || 'committer-date',
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

      // Check if we have more pages (GitHub CLI pagination logic)
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

    return {
      total_count: totalCount,
      incomplete_results: totalCount > allCommits.length,
      commits: optimizedResult.commits as any,
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
 * Build commit search query string for GitHub API
 * Following GitHub CLI query building patterns
 */
function buildCommitSearchQuery(params: GitHubCommitSearchParams): string {
  const queryParts: string[] = [];

  // Handle different query types (GitHub CLI approach)
  if (params.exactQuery) {
    // Exact phrase search with quotes
    queryParts.push(`"${params.exactQuery}"`);
  } else if (params.queryTerms && params.queryTerms.length > 0) {
    // AND logic - terms are space separated (GitHub default)
    queryParts.push(params.queryTerms.join(' '));
  } else if (params.orTerms && params.orTerms.length > 0) {
    // OR logic - explicit OR operator
    queryParts.push(params.orTerms.join(' OR '));
  }

  // Repository filters (GitHub CLI patterns)
  if (params.owner && params.repo) {
    queryParts.push(`repo:${params.owner}/${params.repo}`);
  } else if (params.owner) {
    queryParts.push(`user:${params.owner}`);
  }

  // Author filters (exact GitHub CLI mapping)
  if (params.author) {
    queryParts.push(`author:${params.author}`);
  }
  if (params['author-name']) {
    queryParts.push(`author-name:"${params['author-name']}"`);
  }
  if (params['author-email']) {
    queryParts.push(`author-email:${params['author-email']}`);
  }

  // Committer filters (exact GitHub CLI mapping)
  if (params.committer) {
    queryParts.push(`committer:${params.committer}`);
  }
  if (params['committer-name']) {
    queryParts.push(`committer-name:"${params['committer-name']}"`);
  }
  if (params['committer-email']) {
    queryParts.push(`committer-email:${params['committer-email']}`);
  }

  // Date filters (GitHub CLI format)
  if (params['author-date']) {
    queryParts.push(`author-date:${params['author-date']}`);
  }
  if (params['committer-date']) {
    queryParts.push(`committer-date:${params['committer-date']}`);
  }

  // Hash filters (GitHub CLI mapping)
  if (params.hash) {
    queryParts.push(`hash:${params.hash}`);
  }
  if (params.parent) {
    queryParts.push(`parent:${params.parent}`);
  }
  if (params.tree) {
    queryParts.push(`tree:${params.tree}`);
  }

  // Merge filter (GitHub CLI boolean handling)
  if (params.merge === true) {
    queryParts.push('merge:true');
  } else if (params.merge === false) {
    queryParts.push('merge:false');
  }

  // Visibility filter (GitHub CLI is: qualifier)
  if (params.visibility) {
    queryParts.push(`is:${params.visibility}`);
  }

  return queryParts.join(' ').trim();
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
  const diffData: Map<string, any> = new Map();

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

      const commitObj: any = {
        sha: item.sha, // Use as branch parameter in github_fetch_content
        message: messageSanitized.content,
        author: item.commit?.author?.name ?? item.author?.login ?? 'Unknown',
        date: item.commit?.author?.date
          ? new Date(item.commit.author.date).toLocaleDateString('en-GB')
          : '',
        repository: singleRepo ? undefined : item.repository?.fullName || '',
        url: singleRepo
          ? item.sha
          : `${item.repository?.fullName || ''}@${item.sha}`,
      };

      // Add security warnings if any were detected
      if (warningsCollectorSet.size > 0) {
        commitObj._sanitization_warnings = Array.from(warningsCollectorSet);
      }

      // Add diff information if available
      if (shouldFetchDiff && diffData.has(item.sha)) {
        const commitData = diffData.get(item.sha);
        const files = commitData.files || [];
        commitObj.diff = {
          changed_files: files.length,
          additions: commitData.stats?.additions || 0,
          deletions: commitData.stats?.deletions || 0,
          total_changes: commitData.stats?.total || 0,
          files: files
            .map((f: any) => {
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
          (commitObj._sanitization_warnings?.length || 0)
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

  const firstRepo = items[0].repository;
  const allSameRepo = items.every(
    item => item.repository?.fullName === firstRepo?.fullName
  );

  return allSameRepo ? firstRepo : null;
}

// Simple in-memory cache for default branch results
const defaultBranchCache = new Map<string, string>();

/**
 * Get repository's default branch with caching
 * Works for both CLI and API implementations
 */
export async function getDefaultBranch(
  owner: string,
  repo: string,
  token?: string
): Promise<string | null> {
  const cacheKey = `${owner}/${repo}`;

  // Check cache first
  if (defaultBranchCache.has(cacheKey)) {
    return defaultBranchCache.get(cacheKey)!;
  }

  try {
    const octokit = getOctokit(token);
    const repoInfo = await octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoInfo.data.default_branch || 'main';

    // Cache the successful result
    defaultBranchCache.set(cacheKey, defaultBranch);
    return defaultBranch;
  } catch (error) {
    // Fallback: try to infer from common patterns
    // Don't cache failures to allow retry later
    return null;
  }
}

/**
 * Generate smart hints for file access issues
 */
export function generateFileAccessHints(
  owner: string,
  repo: string,
  filePath: string,
  branch: string,
  defaultBranch?: string | null,
  error?: string
): string[] {
  const hints: string[] = [];

  if (error?.includes('404')) {
    // File or branch not found
    if (defaultBranch && defaultBranch !== branch) {
      hints.push(
        `Try the default branch "${defaultBranch}" instead of "${branch}"`
      );
    }

    hints.push(
      `Use githubViewRepoStructure to verify the file path "${filePath}" exists in ${owner}/${repo}`,
      `Use githubSearchCode to find similar files if "${filePath}" has changed or moved`
    );

    // Suggest common branch alternatives
    const commonBranches = ['main', 'master', 'develop', 'dev'];
    const suggestedBranches = commonBranches
      .filter(b => b !== branch && b !== defaultBranch)
      .slice(0, 2);

    if (suggestedBranches.length > 0) {
      hints.push(`Try common branches: ${suggestedBranches.join(', ')}`);
    }
  } else if (error?.includes('403')) {
    hints.push(
      `Repository ${owner}/${repo} may be private - ensure GITHUB_TOKEN is set`,
      'Check if you have access permissions to this repository'
    );
  } else if (error?.includes('rate limit')) {
    hints.push(
      'GitHub API rate limit exceeded - wait before retrying',
      'Set GITHUB_TOKEN environment variable for higher rate limits'
    );
  }

  return hints;
}

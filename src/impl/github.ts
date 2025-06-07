import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../utils/exec';
import { generateCacheKey, withCache } from '../utils/cache';
import {
  GithubFetchRequestParams,
  GitHubCodeSearchParams,
  GitHubCommitsSearchParams,
  GitHubPullRequestsSearchParams,
  GitHubRepositoryViewParams,
  GitHubRepositoryViewResult,
  GitHubReposSearchParams,
  GitHubReposSearchResult,
  GitHubSearchResult,
  GitHubRepositoryStructureParams,
  GitHubRepositoryStructureResult,
  GitHubIssuesSearchParams,
  GitHubDiscussionsSearchParams,
  GitHubTopicsSearchParams,
  GitHubUsersSearchParams,
} from '../types';

export async function searchGitHubCode(
  params: GitHubCodeSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-code', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubCodeSearchCommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      const searchResult: GitHubSearchResult = {
        searchType: 'code',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(searchResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub code', error);
    }
  });
}

export async function searchGitHubCommits(
  params: GitHubCommitsSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-commits', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubCommitsSearchCommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      const searchResult: GitHubSearchResult = {
        searchType: 'commits',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(searchResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub commits', error);
    }
  });
}

export async function searchGitHubPullRequests(
  params: GitHubPullRequestsSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-prs', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubPullRequestsSearchCommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      const searchResult: GitHubSearchResult = {
        searchType: 'prs',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(searchResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub pull requests', error);
    }
  });
}

export async function searchGitHubRepos(
  params: GitHubReposSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-repos', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubReposSearchCommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      const repoResult: GitHubReposSearchResult = {
        searchType: 'repos',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(repoResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub repositories', error);
    }
  });
}

export async function viewGitHubRepositoryInfo(
  params: GitHubRepositoryViewParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-repo-view', params);

  return withCache(cacheKey, async () => {
    try {
      const owner = params.owner || '';
      const args = ['view', `${owner}/${params.repo}`];
      const result = await executeGitHubCommand('repo', args, { cache: false });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      const viewResult: GitHubRepositoryViewResult = {
        owner,
        repo: params.repo,
        repositoryInfo: content,
        rawOutput: content,
      };

      return createSuccessResult(viewResult);
    } catch (error) {
      return createErrorResult('Failed to view GitHub repository', error);
    }
  });
}

export async function getUserOrganizations(params: {
  limit?: number;
}): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-orgs', params);

  return withCache(cacheKey, async () => {
    try {
      const limit = params.limit || 30;
      const args = ['list', `--limit=${limit}`];
      const result = await executeGitHubCommand('org', args, { cache: false });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const output = execResult.result;

      return {
        content: [
          {
            type: 'text',
            text: `GitHub Organizations for authenticated user:

${output}

 IMPORTANT: Use any of these organization names as the 'owner' parameter in other search tools:
- search_github_code
- search_github_repos  
- search_github_commits
- search_github_pull_requests
- fetch_github_file_content
- view_repository

Example: If you see a private repository in the list above, use the organization name as the 'owner' to filter results to that organization.
If the search for code or repositories by owner fails, try searching without an owner filter`,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get user organizations: ${(error as Error).message}

Make sure you are authenticated with GitHub CLI (gh auth login) and have access to organizations.`,
          },
        ],
        isError: true,
      };
    }
  });
}

export async function fetchGitHubFileContent(
  params: GithubFetchRequestParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-file-content', params);

  return withCache(cacheKey, async () => {
    try {
      const apiPath = `/repos/${params.owner}/${params.repo}/contents/${params.filePath}?ref=${params.branch}`;
      const args = [apiPath, '--jq', '.content'];
      const result = await executeGitHubCommand('api', args, { cache: false });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const base64Content = execResult.result.trim().replace(/\n/g, '');

      // Decode base64 content using Node.js Buffer
      let decodedContent: string;
      try {
        decodedContent = Buffer.from(base64Content, 'base64').toString('utf-8');
      } catch (decodeError) {
        throw new Error(
          `Failed to decode base64 content: ${(decodeError as Error).message}`
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: decodedContent,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResult('Failed to retrieve file content', error);
    }
  });
}

export async function viewRepositoryStructure(
  params: GitHubRepositoryStructureParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-repo-structure', params);

  return withCache(cacheKey, async () => {
    const { owner, repo, branch, path: requestedPath = '' } = params;
    const directoryListing: string[] = [];
    let apiResponse: any = null;
    let actualBranch = branch;

    // Define branch fallback order
    const branchFallbacks = [branch, 'main', 'master', 'develop', 'trunk'];

    try {
      // Construct the path segment
      const pathSegment = requestedPath.startsWith('/')
        ? requestedPath.substring(1)
        : requestedPath;

      // Try each branch in the fallback order
      let lastError: Error | null = null;
      let success = false;

      for (const tryBranch of branchFallbacks) {
        try {
          const apiPath = `repos/${owner}/${repo}/contents/${pathSegment}?ref=${tryBranch}`;
          const args = [apiPath];
          const result = await executeGitHubCommand('api', args, {
            cache: false,
          });

          if (result.isError) {
            throw new Error(result.content[0].text as string);
          }

          // Extract the actual content from the exec result
          const execResult = JSON.parse(result.content[0].text as string);
          const items = JSON.parse(execResult.result);

          // If we get here, the request succeeded
          apiResponse = items;
          actualBranch = tryBranch;
          success = true;

          // Populate directoryListing with names of items at the current path
          if (Array.isArray(items)) {
            for (const item of items) {
              let itemName = item.name;
              if (item.type === 'dir') {
                itemName += '/';
              }
              directoryListing.push(itemName);
            }
          } else if (items) {
            // Handle single file case (though unusual for structure view)
            if (items.name) {
              directoryListing.push(
                items.type === 'dir' ? `${items.name}/` : items.name
              );
            }
          }

          break; // Success, exit the loop
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          // If this is not a 404 error (branch not found), or if it's the last attempt, break
          const errorMessage = lastError.message.toLowerCase();
          if (
            !errorMessage.includes('no commit found') &&
            !errorMessage.includes('404') &&
            !errorMessage.includes('not found')
          ) {
            // This is a different kind of error (permissions, network, etc.), don't continue fallback
            break;
          }

          // Continue to next branch fallback
          continue;
        }
      }

      if (!success) {
        // All branch attempts failed
        const attemptedBranches = branchFallbacks.join(', ');
        throw new Error(
          `Failed to access repository structure. Tried branches: ${attemptedBranches}. ` +
            `Last error: ${lastError?.message || 'Unknown error'}`
        );
      }

      directoryListing.sort(); // Sort for consistent output

      const result: GitHubRepositoryStructureResult = {
        owner,
        repo,
        branch: actualBranch, // Include the branch that actually worked
        structure: directoryListing,
        rawOutput: apiResponse,
        // Add metadata about branch fallback if different from requested
        ...(actualBranch !== branch && {
          branchFallback: {
            requested: branch,
            used: actualBranch,
            message: `Branch '${branch}' not found, used '${actualBranch}' instead`,
          },
        }),
      };

      return createSuccessResult(result);
    } catch (error) {
      // Final error handling with comprehensive error message
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return createErrorResult(
        `Failed to view GitHub repository structure for ${owner}/${repo} at path '${requestedPath}': ${errorMessage}`,
        error
      );
    }
  });
}

export async function searchGitHubIssues(
  params: GitHubIssuesSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-issues', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubIssuesSearchCommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      const searchResult: GitHubSearchResult = {
        searchType: 'issues',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(searchResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub issues', error);
    }
  });
}

export async function searchGitHubTopics(
  params: GitHubTopicsSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-topics', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubTopicsAPICommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      const searchResult: GitHubSearchResult = {
        searchType: 'topics',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(searchResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub topics', error);
    }
  });
}

export async function searchGitHubUsers(
  params: GitHubUsersSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-users', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubUsersAPICommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      const searchResult: GitHubSearchResult = {
        searchType: 'users',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(searchResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub users', error);
    }
  });
}

export async function searchGitHubDiscussions(
  params: GitHubDiscussionsSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-discussions', params);

  return withCache(cacheKey, async () => {
    try {
      const { command, args } = buildGitHubDiscussionsAPICommand(params);
      const result = await executeGitHubCommand(command, args, {
        cache: false,
      });

      if (result.isError) {
        return result;
      }

      // Extract the actual content from the exec result
      const execResult = JSON.parse(result.content[0].text as string);
      const content = execResult.result;

      const searchResult: GitHubSearchResult = {
        searchType: 'discussions',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      // Parse the response to provide helpful context
      try {
        const parsedContent = JSON.parse(content);

        // Handle repository-specific response
        if (parsedContent?.data?.repository?.discussions) {
          const discussions = parsedContent.data.repository.discussions;
          const discussionCount = discussions.totalCount || 0;

          if (discussionCount === 0 && params.owner && params.repo) {
            searchResult.results = JSON.stringify(
              {
                ...parsedContent,
                searchInfo: {
                  message: `No discussions found in repository "${params.owner}/${params.repo}". The repository may not have discussions enabled or there are no discussions matching the criteria.`,
                  searchScope: `repo:${params.owner}/${params.repo}`,
                  query: params.query,
                  discussionCount: 0,
                  repositorySpecific: true,
                },
              },
              null,
              2
            );
          }
        }
        // Handle search API response
        else if (parsedContent?.data?.search) {
          const discussionCount =
            parsedContent.data.search.discussionCount || 0;

          if (discussionCount === 0 && params.owner) {
            const scopeInfo = params.repo
              ? `repository "${params.owner}/${params.repo}"`
              : `organization "${params.owner}"`;

            searchResult.results = JSON.stringify(
              {
                ...parsedContent,
                searchInfo: {
                  message: `No discussions found in ${scopeInfo}. This search was scoped to ${params.owner} only and did not search other organizations. The repository may not have discussions enabled.`,
                  searchScope: params.repo
                    ? `repo:${params.owner}/${params.repo}`
                    : `org:${params.owner}`,
                  query: params.query,
                  discussionCount: 0,
                  globalSearch: !params.repo,
                },
              },
              null,
              2
            );
          }
        }
      } catch (parseError) {
        // If we can't parse the JSON, just return the original result
      }

      return createSuccessResult(searchResult);
    } catch (error) {
      return createErrorResult('Failed to search GitHub discussions', error);
    }
  });
}

function buildGitHubCodeSearchCommand(params: GitHubCodeSearchParams): {
  command: string;
  args: string[];
} {
  // Enhanced query processing for GitHub advanced syntax
  const processedQuery = processAdvancedSearchQuery(params.query || '');
  const args = ['code', processedQuery];

  if (params.owner) args.push(`--owner=${params.owner}`);
  if (params.repo) args.push(`--repo=${params.repo}`);
  if (params.language) args.push(`--language=${params.language}`);
  if (params.filename) args.push(`--filename=${params.filename}`);
  if (params.extension) args.push(`--extension=${params.extension}`);
  if (params.path) args.push(`--path=${params.path}`);
  if (params.in) args.push(`--in=${params.in}`);
  if (params.size) args.push(`--size=${params.size}`);
  if (params.match) args.push(`--match=${params.match}`);
  if (params.limit) args.push(`--limit=${params.limit}`);

  return { command: 'search', args };
}

/**
 * Enhanced query processing for GitHub advanced search syntax:
 * - Preserves boolean operations (AND, OR, NOT)
 * - Maintains quoted strings for exact matches
 * - Handles regex patterns (/pattern/)
 * - Supports qualifiers within the query
 * - Preserves GitHub search syntax
 */
function processAdvancedSearchQuery(query: string): string {
  if (!query) return '""';

  // Preserve query if it contains GitHub qualifiers or advanced syntax
  const hasQualifiers =
    /\b(language|path|filename|extension|in|size|user|org|repo):/i.test(query);
  const hasBooleanOps = /\b(AND|OR|NOT)\b/i.test(query);
  const hasRegex = /\/.*\//.test(query);
  const hasQuotes = /"[^"]*"/.test(query);
  const hasParentheses = /\([^)]*\)/.test(query);

  // If query contains advanced syntax, preserve it as-is (no additional quotes)
  if (hasQualifiers || hasBooleanOps || hasRegex || hasParentheses) {
    return query.trim();
  }

  // If query is already properly quoted, preserve it
  if (hasQuotes && query.trim().startsWith('"') && query.trim().endsWith('"')) {
    return query.trim();
  }

  // For simple queries, add quotes for exact matching
  const trimmed = query.trim();
  return `"${trimmed}"`;
}

function buildGitHubCommitsSearchCommand(params: GitHubCommitsSearchParams): {
  command: string;
  args: string[];
} {
  const args = ['commits', `"${params.query}"`];

  if (params.owner) args.push(`--owner=${params.owner}`);
  if (params.repo) args.push(`--repo=${params.repo}`);
  if (params.author) args.push(`--author=${params.author}`);
  if (params.committer) args.push(`--committer=${params.committer}`);
  if (params.authorDate) args.push(`--author-date=${params.authorDate}`);
  if (params.committerDate)
    args.push(`--committer-date=${params.committerDate}`);
  if (params.authorEmail) args.push(`--author-email=${params.authorEmail}`);
  if (params.authorName) args.push(`--author-name="${params.authorName}"`);
  if (params.committerEmail)
    args.push(`--committer-email=${params.committerEmail}`);
  if (params.committerName)
    args.push(`--committer-name="${params.committerName}"`);
  if (params.merge !== undefined) args.push(`--merge`);
  if (params.hash) args.push(`--hash=${params.hash}`);
  if (params.parent) args.push(`--parent=${params.parent}`);
  if (params.tree) args.push(`--tree=${params.tree}`);
  if (params.visibility) args.push(`--visibility=${params.visibility}`);
  if (params.limit) args.push(`--limit=${params.limit}`);
  if (params.sort && params.sort !== 'best-match')
    args.push(`--sort=${params.sort}`);
  if (params.order) args.push(`--order=${params.order}`);

  return { command: 'search', args };
}

function buildGitHubPullRequestsSearchCommand(
  params: GitHubPullRequestsSearchParams
): { command: string; args: string[] } {
  const args = ['prs', `"${params.query}"`];

  if (params.owner) args.push(`--owner=${params.owner}`);
  if (params.repo) args.push(`--repo=${params.repo}`);
  if (params.author) args.push(`--author=${params.author}`);
  if (params.assignee) args.push(`--assignee=${params.assignee}`);
  if (params.mentions) args.push(`--mentions=${params.mentions}`);
  if (params.commenter) args.push(`--commenter=${params.commenter}`);
  if (params.involves) args.push(`--involves=${params.involves}`);
  if (params.reviewedBy) args.push(`--reviewed-by=${params.reviewedBy}`);
  if (params.reviewRequested)
    args.push(`--review-requested=${params.reviewRequested}`);
  if (params.state) args.push(`--state=${params.state}`);
  if (params.head) args.push(`--head=${params.head}`);
  if (params.base) args.push(`--base=${params.base}`);
  if (params.language) args.push(`--language=${params.language}`);
  if (params.created) args.push(`--created=${params.created}`);
  if (params.updated) args.push(`--updated=${params.updated}`);
  if (params.merged) args.push(`--merged=${params.merged}`);
  if (params.closed) args.push(`--closed=${params.closed}`);
  if (params.draft !== undefined) args.push(`--draft=${params.draft}`);
  if (params.limit) args.push(`--limit=${params.limit}`);
  if (params.sort) args.push(`--sort=${params.sort}`);
  if (params.order) args.push(`--order=${params.order}`);

  return { command: 'search', args };
}

function buildGitHubReposSearchCommand(params: GitHubReposSearchParams): {
  command: string;
  args: string[];
} {
  // Process query to use single-word strategy for repository discovery
  const processedQuery = processSimpleSearchQuery(params.query || '');
  const args = ['repos', processedQuery];

  if (params.owner) args.push(`--owner=${params.owner}`);
  if (params.archived !== undefined) args.push(`--archived=${params.archived}`);
  if (params.created) args.push(`--created="${params.created}"`);
  if (params.followers !== undefined)
    args.push(`--followers=${params.followers}`);
  if (params.forks !== undefined) args.push(`--forks=${params.forks}`);
  if (params.goodFirstIssues !== undefined)
    args.push(`--good-first-issues=${params.goodFirstIssues}`);
  if (params.helpWantedIssues !== undefined)
    args.push(`--help-wanted-issues=${params.helpWantedIssues}`);
  if (params.includeForks) args.push(`--include-forks=${params.includeForks}`);
  if (params.language) args.push(`--language=${params.language}`);
  if (params.license) args.push(`--license=${params.license}`);
  if (params.limit) args.push(`--limit=${params.limit}`);
  if (params.match) args.push(`--match=${params.match}`);
  if (params.numberTopics !== undefined)
    args.push(`--number-topics=${params.numberTopics}`);
  if (params.order) args.push(`--order=${params.order}`);
  if (params.size) args.push(`--size="${params.size}"`);

  // DEFAULT TO UPDATED SORTING for recency prioritization
  const sortBy = params.sort || 'updated';
  if (sortBy !== 'best-match') {
    args.push(`--sort=${sortBy}`);
  }

  if (params.stars !== undefined) args.push(`--stars=${params.stars}`);
  if (params.topic) args.push(`--topic=${params.topic}`);
  if (params.updated) args.push(`--updated="${params.updated}"`);
  if (params.visibility) args.push(`--visibility=${params.visibility}`);

  return { command: 'search', args };
}

/**
 * Simple search query processing for repository discovery:
 * - Prioritize single terms over combined searches
 * - "RAG" stays as "RAG" (single word search)
 * - "RAG Ranking" becomes "RAG" (use first term only for initial search)
 * - Only combine terms when explicitly needed after initial searches
 * - Preserve quoted phrases as-is for exact matches
 */
function processSimpleSearchQuery(query: string): string {
  if (!query) return '""';

  // Check if query is already properly quoted single term
  const singleQuotedPattern = /^"[^"]*"$/;
  if (singleQuotedPattern.test(query.trim())) {
    return query.trim();
  }

  // Check if query is multiple quoted terms (advanced search)
  const multipleQuotedPattern = /^(\s*"[^"]+"\s*)+$/;
  if (multipleQuotedPattern.test(query.trim())) {
    return query.trim();
  }

  // Plain text query - PRIORITIZE SINGLE WORDS for progressive search
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(term => term.length > 0);

  if (terms.length === 0) return '""';

  // FOR PROGRESSIVE SEARCH: Use only the first term initially
  // This implements the "RAG" then "Ranking" strategy instead of "RAG Ranking"
  if (terms.length === 1) {
    return `"${terms[0]}"`;
  }

  // For multiple terms, prioritize the first term (most important)
  // This encourages users to do separate searches: "RAG" first, then "Ranking"
  return `"${terms[0]}"`;
}

function buildGitHubIssuesSearchCommand(params: GitHubIssuesSearchParams): {
  command: string;
  args: string[];
} {
  const args = ['issues', `"${params.query}"`];

  if (params.owner) args.push(`--owner=${params.owner}`);
  if (params.repo) args.push(`--repo=${params.repo}`);
  if (params.app) args.push(`--app=${params.app}`);
  if (params.archived !== undefined) args.push(`--archived=${params.archived}`);
  if (params.author) args.push(`--author=${params.author}`);
  if (params.assignee) args.push(`--assignee=${params.assignee}`);
  if (params.closed) args.push(`--closed=${params.closed}`);
  if (params.commenter) args.push(`--commenter=${params.commenter}`);
  if (params.comments !== undefined) args.push(`--comments=${params.comments}`);
  if (params.created) args.push(`--created=${params.created}`);
  if (params.includePrs !== undefined) args.push(`--include-prs`);
  if (params.interactions !== undefined)
    args.push(`--interactions=${params.interactions}`);
  if (params.involves) args.push(`--involves=${params.involves}`);
  if (params.label) args.push(`--label=${params.label}`);
  if (params.language) args.push(`--language=${params.language}`);
  if (params.locked !== undefined) args.push(`--locked=${params.locked}`);
  if (params.match) args.push(`--match=${params.match}`);
  if (params.mentions) args.push(`--mentions=${params.mentions}`);
  if (params.milestone) args.push(`--milestone=${params.milestone}`);
  if (params.noAssignee !== undefined) args.push(`--no-assignee`);
  if (params.noLabel !== undefined) args.push(`--no-label`);
  if (params.noMilestone !== undefined) args.push(`--no-milestone`);
  if (params.noProject !== undefined) args.push(`--no-project`);
  if (params.project) args.push(`--project=${params.project}`);
  if (params.reactions !== undefined)
    args.push(`--reactions=${params.reactions}`);
  if (params.state) args.push(`--state=${params.state}`);
  if (params.teamMentions) args.push(`--team-mentions=${params.teamMentions}`);
  if (params.updated) args.push(`--updated=${params.updated}`);
  if (params.visibility) args.push(`--visibility=${params.visibility}`);
  if (params.limit) args.push(`--limit=${params.limit}`);
  if (params.sort) args.push(`--sort=${params.sort}`);
  if (params.order) args.push(`--order=${params.order}`);

  return { command: 'search', args };
}

function buildGitHubTopicsAPICommand(params: GitHubTopicsSearchParams): {
  command: string;
  args: string[];
} {
  // Build GitHub API search query for topics
  const searchQuery = params.query || '';

  // Add filters to the search query
  const queryParts = [searchQuery];

  if (params.featured) queryParts.push('is:featured');
  if (params.curated) queryParts.push('is:curated');
  if (params.repositories)
    queryParts.push(`repositories:${params.repositories}`);
  if (params.created) queryParts.push(`created:${params.created}`);

  const finalQuery = queryParts.join(' ').trim();

  // Use GitHub API to search topics
  let apiPath = 'search/topics';
  const queryParams: string[] = [];

  if (finalQuery) {
    queryParams.push(`q=${encodeURIComponent(finalQuery)}`);
  }

  // Add pagination parameters
  const limit = params.limit || 30;
  queryParams.push(`per_page=${limit}`);

  if (params.sort) queryParams.push(`sort=${params.sort}`);
  if (params.order) queryParams.push(`order=${params.order}`);

  if (queryParams.length > 0) {
    apiPath += `?${queryParams.join('&')}`;
  }

  return { command: 'api', args: [apiPath] };
}

function buildGitHubUsersAPICommand(params: GitHubUsersSearchParams): {
  command: string;
  args: string[];
} {
  // Build GitHub API search query for users
  const searchQuery = params.query || '';

  // Add filters to the search query
  const queryParts = [searchQuery];

  if (params.type) queryParts.push(`type:${params.type}`);
  if (params.location) queryParts.push(`location:"${params.location}"`);
  if (params.language) queryParts.push(`language:${params.language}`);
  if (params.followers) queryParts.push(`followers:${params.followers}`);
  if (params.repos) queryParts.push(`repos:${params.repos}`);
  if (params.created) queryParts.push(`created:${params.created}`);

  const finalQuery = queryParts.join(' ').trim();

  // Use GitHub API to search users
  let apiPath = 'search/users';
  const queryParams: string[] = [];

  if (finalQuery) {
    queryParams.push(`q=${encodeURIComponent(finalQuery)}`);
  }

  // Add pagination parameters
  const limit = params.limit || 30;
  queryParams.push(`per_page=${limit}`);

  if (params.sort) queryParams.push(`sort=${params.sort}`);
  if (params.order) queryParams.push(`order=${params.order}`);

  if (queryParams.length > 0) {
    apiPath += `?${queryParams.join('&')}`;
  }

  return { command: 'api', args: [apiPath] };
}

function buildGitHubDiscussionsAPICommand(
  params: GitHubDiscussionsSearchParams
): { command: string; args: string[] } {
  // Build search query
  const searchQuery = params.query || '';
  const limit = params.limit || 30;

  // If we have both owner and repo, use repository-specific discussions API
  if (params.owner && params.repo) {
    const query = `query($owner: String!, $repo: String!, $first: Int!) {
      repository(owner: $owner, name: $repo) {
        discussions(first: $first) {
          totalCount
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            title
            body
            url
            createdAt
            updatedAt
            author {
              login
              ... on User {
                name
              }
            }
            repository {
              nameWithOwner
              url
            }
            category {
              name
              slug
            }
            answerChosenAt
            isAnswered
            upvoteCount
            comments {
              totalCount
            }
          }
        }
      }
    }`;

    return {
      command: 'api',
      args: [
        'graphql',
        '--field',
        `query=${query}`,
        '--field',
        `owner=${params.owner}`,
        '--field',
        `repo=${params.repo}`,
        '--field',
        `first=${limit}`,
      ],
    };
  }

  // For global search or organization-only search, use the search API
  const queryParts = [searchQuery];

  if (params.owner && !params.repo) {
    // Search within organization
    queryParts.push(`org:${params.owner}`);
  }

  if (params.author) queryParts.push(`author:${params.author}`);
  if (params.category) queryParts.push(`category:"${params.category}"`);
  if (params.answered !== undefined) {
    queryParts.push(params.answered ? 'is:answered' : 'is:unanswered');
  }
  if (params.created) queryParts.push(`created:${params.created}`);
  if (params.updated) queryParts.push(`updated:${params.updated}`);

  const finalQuery = queryParts.join(' ').trim();

  const searchQueryGql = `query($searchQuery: String!, $first: Int!) {
    search(query: $searchQuery, type: DISCUSSION, first: $first) {
      discussionCount
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          ... on Discussion {
            id
            title
            body
            url
            createdAt
            updatedAt
            author {
              login
              ... on User {
                name
              }
            }
            repository {
              nameWithOwner
              url
            }
            category {
              name
              slug
            }
            answerChosenAt
            isAnswered
            upvoteCount
            comments {
              totalCount
            }
          }
        }
      }
    }
  }`;

  return {
    command: 'api',
    args: [
      'graphql',
      '--field',
      `query=${searchQueryGql}`,
      '--field',
      `searchQuery=${finalQuery}`,
      '--field',
      `first=${limit}`,
    ],
  };
}

function createSuccessResult(data: any): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    isError: false,
  };
}

function createErrorResult(message: string, error: unknown): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: `${message}: ${(error as Error).message}`,
      },
    ],
    isError: true,
  };
}

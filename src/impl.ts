import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import NodeCache from 'node-cache';
import crypto from 'crypto';
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
  NpmRepositoryResult,
  NpmSearchParams,
  GitHubRepositoryStructureParams,
  GitHubRepositoryStructureResult,
  GitHubIssuesSearchParams,
  GitHubDiscussionsSearchParams,
  GitHubTopicsSearchParams,
  GitHubUsersSearchParams,
} from './types';

const execAsync = promisify(exec);
const cache = new NodeCache({
  stdTTL: 3600, // 1 hour cache
  checkperiod: 600, // Check for expired keys every 10 minutes
});

function generateCacheKey(prefix: string, params: any): string {
  const paramString = JSON.stringify(params, Object.keys(params).sort());
  const hash = crypto.createHash('md5').update(paramString).digest('hex');
  return `${prefix}:${hash}`;
}

async function withCache(
  cacheKey: string,
  operation: () => Promise<CallToolResult>
): Promise<CallToolResult> {
  // Check if result exists in cache
  const cachedResult = cache.get<CallToolResult>(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  // Execute operation
  const result = await operation();

  // Only cache successful responses
  if (!result.isError) {
    cache.set(cacheKey, result);
  }

  return result;
}

export async function searchGitHubCode(
  params: GitHubCodeSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-code', params);

  return withCache(cacheKey, async () => {
    try {
      const command = buildGitHubCodeSearchCommand(params);
      const content = execSync(command, { encoding: 'utf-8' });

      const result: GitHubSearchResult = {
        searchType: 'code',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(result);
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
      const command = buildGitHubCommitsSearchCommand(params);
      const content = execSync(command, { encoding: 'utf-8' });

      const result: GitHubSearchResult = {
        searchType: 'commits',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(result);
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
      const command = buildGitHubPullRequestsSearchCommand(params);
      const content = execSync(command, { encoding: 'utf-8' });

      const result: GitHubSearchResult = {
        searchType: 'prs',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(result);
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
      const command = buildGitHubReposSearchCommand(params);
      const content = execSync(command, { encoding: 'utf-8' });

      const result: GitHubReposSearchResult = {
        searchType: 'repos',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(result);
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
      const command = `gh repo view ${owner}/${params.repo}`;
      const content = execSync(command, { encoding: 'utf-8' });

      const result: GitHubRepositoryViewResult = {
        owner,
        repo: params.repo,
        repositoryInfo: content,
        rawOutput: content,
      };

      return createSuccessResult(result);
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
      const command = `gh org list --limit ${limit}`;

      const output = execSync(command, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

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
      const command = `gh api /repos/${params.owner}/${params.repo}/contents/${params.filePath}?ref=${params.branch} --jq .content | base64 -d`;
      const content = execSync(command, { encoding: 'utf-8' });

      return {
        content: [
          {
            type: 'text',
            text: content,
          },
        ],
        isError: false,
      };
    } catch (error) {
      return createErrorResult('Failed to retrieve file content', error);
    }
  });
}

export async function npmView(packageName: string): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('npm-view', { packageName });

  return withCache(cacheKey, async () => {
    try {
      const { stdout } = await execAsync(
        `npm view ${packageName} repository.url repository.directory dependencies devdependencies peerDependencies version --json`
      );
      const result: NpmRepositoryResult = JSON.parse(stdout);
      return createSuccessResult(result);
    } catch (error) {
      return createErrorResult(
        'Failed to get npm repository information',
        error
      );
    }
  });
}

export async function npmSearch(
  args: NpmSearchParams
): Promise<CallToolResult> {
  const { query, json = true, searchlimit = 20 } = args;
  let command = `npm search "${query}" --searchlimit=${searchlimit}`;
  if (json) {
    command += ' --json';
  }

  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) {
      return {
        content: [{ type: 'text', text: `Error searching NPM: ${stderr}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text', text: stdout }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Failed to execute npm search: ${(error as Error).message}`,
        },
      ],
      isError: true,
    };
  }
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
          const command = `gh api repos/${owner}/${repo}/contents/${pathSegment}?ref=${tryBranch}`;
          const stdout = execSync(command, { encoding: 'utf-8' });
          const items = JSON.parse(stdout);

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
      const command = buildGitHubIssuesSearchCommand(params);
      const content = execSync(command, { encoding: 'utf-8' });

      const result: GitHubSearchResult = {
        searchType: 'issues',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(result);
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
      // Use GitHub API for topics search since gh search topics doesn't exist
      const command = buildGitHubTopicsAPICommand(params);
      const content = execSync(command, { encoding: 'utf-8' });

      const result: GitHubSearchResult = {
        searchType: 'topics',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(result);
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
      // Use GitHub API for users search since gh search users doesn't exist
      const command = buildGitHubUsersAPICommand(params);
      const content = execSync(command, { encoding: 'utf-8' });

      const result: GitHubSearchResult = {
        searchType: 'users',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      return createSuccessResult(result);
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
      // Use GitHub API for discussions search since gh search discussions doesn't exist
      const command = buildGitHubDiscussionsAPICommand(params);
      const content = execSync(command, { encoding: 'utf-8' });

      const result: GitHubSearchResult = {
        searchType: 'discussions',
        query: params.query || '',
        results: content,
        rawOutput: content,
      };

      // Parse the response to check if we have any discussions
      try {
        const parsedContent = JSON.parse(content);
        const discussionCount =
          parsedContent?.data?.search?.discussionCount || 0;

        // If no discussions found and we have a specific owner, provide helpful context
        if (discussionCount === 0 && params.owner) {
          const scopeInfo = params.repo
            ? `repository "${params.owner}/${params.repo}"`
            : `organization "${params.owner}"`;

          result.results = JSON.stringify(
            {
              ...parsedContent,
              searchInfo: {
                message: `No discussions found in ${scopeInfo}. This search was scoped to ${params.owner} only and did not search other organizations. The repository may not have discussions enabled.`,
                searchScope: params.repo
                  ? `repo:${params.owner}/${params.repo}`
                  : `org:${params.owner}`,
                query: params.query,
                discussionCount: 0,
              },
            },
            null,
            2
          );
        }
      } catch (parseError) {
        // If we can't parse the JSON, just return the original result
      }

      return createSuccessResult(result);
    } catch (error) {
      return createErrorResult('Failed to search GitHub discussions', error);
    }
  });
}

function buildGitHubCodeSearchCommand(params: GitHubCodeSearchParams): string {
  // Apply progressive single-word search strategy for optimal discovery
  const processedQuery = processSearchQuery(params.query || '');
  let command = `gh search code ${processedQuery}`;

  if (params.owner) command += ` --owner ${params.owner}`;
  if (params.repo) command += ` --repo ${params.repo}`;
  if (params.language) command += ` --language ${params.language}`;
  if (params.filename) command += ` --filename ${params.filename}`;
  if (params.extension) command += ` --extension ${params.extension}`;
  if (params.match) command += ` --match ${params.match}`;
  if (params.limit) command += ` --limit ${params.limit}`;

  return command;
}

/**
 * Process search query to implement progressive single-word search strategy:
 * - Prioritize single terms over combined searches
 * - "RAG" stays as "RAG" (single word search)
 * - "RAG Ranking" becomes "RAG" (use first term only for initial search)
 * - Only combine terms when explicitly needed after initial searches
 * - Preserve quoted phrases as-is for exact matches
 */
function processSearchQuery(query: string): string {
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

function buildGitHubCommitsSearchCommand(
  params: GitHubCommitsSearchParams
): string {
  let command = `gh search commits "${params.query}"`;

  if (params.owner) command += ` --owner ${params.owner}`;
  if (params.repo) command += ` --repo ${params.repo}`;
  if (params.author) command += ` --author ${params.author}`;
  if (params.committer) command += ` --committer ${params.committer}`;
  if (params.authorDate) command += ` --author-date ${params.authorDate}`;
  if (params.committerDate)
    command += ` --committer-date ${params.committerDate}`;
  if (params.authorEmail) command += ` --author-email ${params.authorEmail}`;
  if (params.authorName) command += ` --author-name "${params.authorName}"`;
  if (params.committerEmail)
    command += ` --committer-email ${params.committerEmail}`;
  if (params.committerName)
    command += ` --committer-name "${params.committerName}"`;
  if (params.merge !== undefined) command += ` --merge`;
  if (params.hash) command += ` --hash ${params.hash}`;
  if (params.parent) command += ` --parent ${params.parent}`;
  if (params.tree) command += ` --tree ${params.tree}`;
  if (params.visibility) command += ` --visibility ${params.visibility}`;
  if (params.limit) command += ` --limit ${params.limit}`;
  if (params.sort && params.sort !== 'best-match')
    command += ` --sort ${params.sort}`;
  if (params.order) command += ` --order ${params.order}`;

  return command;
}

function buildGitHubPullRequestsSearchCommand(
  params: GitHubPullRequestsSearchParams
): string {
  let command = `gh search prs "${params.query}"`;

  if (params.owner) command += ` --owner ${params.owner}`;
  if (params.repo) command += ` --repo ${params.repo}`;
  if (params.author) command += ` --author ${params.author}`;
  if (params.assignee) command += ` --assignee ${params.assignee}`;
  if (params.mentions) command += ` --mentions ${params.mentions}`;
  if (params.commenter) command += ` --commenter ${params.commenter}`;
  if (params.involves) command += ` --involves ${params.involves}`;
  if (params.reviewedBy) command += ` --reviewed-by ${params.reviewedBy}`;
  if (params.reviewRequested)
    command += ` --review-requested ${params.reviewRequested}`;
  if (params.state) command += ` --state ${params.state}`;
  if (params.head) command += ` --head ${params.head}`;
  if (params.base) command += ` --base ${params.base}`;
  if (params.language) command += ` --language ${params.language}`;
  if (params.created) command += ` --created ${params.created}`;
  if (params.updated) command += ` --updated ${params.updated}`;
  if (params.merged) command += ` --merged ${params.merged}`;
  if (params.closed) command += ` --closed ${params.closed}`;
  if (params.draft !== undefined) command += ` --draft ${params.draft}`;
  if (params.limit) command += ` --limit ${params.limit}`;
  if (params.sort) command += ` --sort ${params.sort}`;
  if (params.order) command += ` --order ${params.order}`;

  return command;
}

function buildGitHubReposSearchCommand(
  params: GitHubReposSearchParams
): string {
  // Process query to use single-word strategy
  const processedQuery = processSearchQuery(params.query || '');
  let command = `gh search repos ${processedQuery}`;

  if (params.owner) command += ` --owner ${params.owner}`;
  if (params.archived !== undefined)
    command += ` --archived ${params.archived}`;
  if (params.created) command += ` --created "${params.created}"`;
  if (params.followers !== undefined)
    command += ` --followers ${params.followers}`;
  if (params.forks !== undefined) command += ` --forks ${params.forks}`;
  if (params.goodFirstIssues !== undefined)
    command += ` --good-first-issues ${params.goodFirstIssues}`;
  if (params.helpWantedIssues !== undefined)
    command += ` --help-wanted-issues ${params.helpWantedIssues}`;
  if (params.includeForks) command += ` --include-forks ${params.includeForks}`;
  if (params.language) command += ` --language ${params.language}`;
  if (params.license) command += ` --license ${params.license}`;
  if (params.limit) command += ` --limit ${params.limit}`;
  if (params.match) command += ` --match ${params.match}`;
  if (params.numberTopics !== undefined)
    command += ` --number-topics ${params.numberTopics}`;
  if (params.order) command += ` --order ${params.order}`;
  if (params.size) command += ` --size "${params.size}"`;

  // DEFAULT TO UPDATED SORTING for recency prioritization
  const sortBy = params.sort || 'updated';
  if (sortBy !== 'best-match') {
    command += ` --sort ${sortBy}`;
  }

  if (params.stars !== undefined) command += ` --stars ${params.stars}`;
  if (params.topic) command += ` --topic ${params.topic}`;
  if (params.updated) command += ` --updated "${params.updated}"`;
  if (params.visibility) command += ` --visibility ${params.visibility}`;

  return command;
}

function buildGitHubIssuesSearchCommand(
  params: GitHubIssuesSearchParams
): string {
  let command = `gh search issues "${params.query}"`;

  if (params.owner) command += ` --owner ${params.owner}`;
  if (params.repo) command += ` --repo ${params.repo}`;
  if (params.author) command += ` --author ${params.author}`;
  if (params.assignee) command += ` --assignee ${params.assignee}`;
  if (params.mentions) command += ` --mentions ${params.mentions}`;
  if (params.commenter) command += ` --commenter ${params.commenter}`;
  if (params.involves) command += ` --involves ${params.involves}`;
  if (params.state) command += ` --state ${params.state}`;
  if (params.labels) command += ` --labels ${params.labels}`;
  if (params.milestone) command += ` --milestone ${params.milestone}`;
  if (params.project) command += ` --project ${params.project}`;
  if (params.language) command += ` --language ${params.language}`;
  if (params.created) command += ` --created ${params.created}`;
  if (params.updated) command += ` --updated ${params.updated}`;
  if (params.closed) command += ` --closed ${params.closed}`;
  if (params.limit) command += ` --limit ${params.limit}`;
  if (params.sort) command += ` --sort ${params.sort}`;
  if (params.order) command += ` --order ${params.order}`;

  return command;
}

function buildGitHubTopicsAPICommand(params: GitHubTopicsSearchParams): string {
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
  let command = `gh api search/topics -q '.items'`;
  if (finalQuery) {
    command = `gh api 'search/topics?q=${encodeURIComponent(finalQuery)}'`;
  }

  // Add pagination parameters
  const limit = params.limit || 30;
  command += `${finalQuery ? '&' : '?'}per_page=${limit}`;

  if (params.sort) command += `&sort=${params.sort}`;
  if (params.order) command += `&order=${params.order}`;

  return command;
}

function buildGitHubUsersAPICommand(params: GitHubUsersSearchParams): string {
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
  let command = `gh api search/users -q '.items'`;
  if (finalQuery) {
    command = `gh api 'search/users?q=${encodeURIComponent(finalQuery)}'`;
  }

  // Add pagination parameters
  const limit = params.limit || 30;
  command += `${finalQuery ? '&' : '?'}per_page=${limit}`;

  if (params.sort) command += `&sort=${params.sort}`;
  if (params.order) command += `&order=${params.order}`;

  return command;
}

function buildGitHubDiscussionsAPICommand(
  params: GitHubDiscussionsSearchParams
): string {
  // GitHub Discussions search is not available via REST API
  // We'll use GraphQL API through gh api graphql
  const query = `
    query($searchQuery: String!, $first: Int!) {
      search(query: $searchQuery, type: DISCUSSION, first: $first) {
        discussionCount
        edges {
          node {
            ... on Discussion {
              title
              body
              url
              createdAt
              updatedAt
              author {
                login
              }
              repository {
                nameWithOwner
              }
              category {
                name
              }
              answerChosenAt
            }
          }
        }
      }
    }
  `;

  // Build search query
  const searchQuery = params.query || '';
  const queryParts = [searchQuery];

  // Always scope to specific repo if both owner and repo are provided
  if (params.repo && params.owner) {
    queryParts.push(`repo:${params.owner}/${params.repo}`);
  } else if (params.owner) {
    // If only owner is specified, search within that owner's organization
    // This prevents fallback to user's organizations when searching for specific packages
    queryParts.push(`org:${params.owner}`);
  }
  // If no owner is specified, search globally (current behavior)

  if (params.author) queryParts.push(`author:${params.author}`);
  if (params.category) queryParts.push(`category:"${params.category}"`);
  if (params.answered !== undefined) {
    queryParts.push(params.answered ? 'is:answered' : 'is:unanswered');
  }
  if (params.created) queryParts.push(`created:${params.created}`);
  if (params.updated) queryParts.push(`updated:${params.updated}`);

  const finalQuery = queryParts.join(' ').trim();
  const limit = params.limit || 30;

  return `gh api graphql -f query='${query}' -f searchQuery='${finalQuery}' -F first=${limit}`;
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

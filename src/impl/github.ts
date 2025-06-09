import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../utils/exec';
import { generateCacheKey, withCache } from '../utils/cache';
import {
  GithubFetchRequestParams,
  GitHubSearchResult,
  GitHubRepositoryStructureParams,
  GitHubRepositoryStructureResult,
  GitHubIssuesSearchParams,
  GitHubDiscussionsSearchParams,
  GitHubTopicsSearchParams,
  GitHubUsersSearchParams,
} from '../types';

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
      let apiPath = `/repos/${params.owner}/${params.repo}/contents/${params.filePath}`;

      // Add ref parameter if branch is provided
      if (params.branch) {
        apiPath += `?ref=${params.branch}`;
      }

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

/**
 * Determines if a string needs quoting for GitHub search
 */
export function needsQuoting(str: string): boolean {
  return (
    str.includes(' ') ||
    str.includes('"') ||
    str.includes('\t') ||
    str.includes('\n') ||
    str.includes('\r') ||
    /[<>(){}[\]\\|&;]/.test(str)
  );
}

function buildGitHubIssuesSearchCommand(params: GitHubIssuesSearchParams): {
  command: string;
  args: string[];
} {
  // Build query following GitHub CLI patterns
  const queryParts: string[] = [];

  // Add main search query
  if (params.query) {
    const query = params.query.trim();
    queryParts.push(needsQuoting(query) ? `"${query}"` : query);
  }

  // Add repository/organization qualifiers
  if (params.owner && params.repo) {
    queryParts.push(`repo:${params.owner}/${params.repo}`);
  } else if (params.owner) {
    queryParts.push(`org:${params.owner}`);
  }

  // Construct query string
  const queryString = queryParts.filter(part => part.length > 0).join(' ');

  const args = ['issues', queryString];

  // Add individual flags for additional qualifiers
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
  if (params.labels) args.push(`--label=${params.labels}`);
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

  // Add owner parameter if provided
  if (params.owner) {
    queryParams.push(`owner=${encodeURIComponent(params.owner)}`);
  }

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

export function createSuccessResult(data: any): CallToolResult {
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

export function createErrorResult(
  message: string,
  error: unknown
): CallToolResult {
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

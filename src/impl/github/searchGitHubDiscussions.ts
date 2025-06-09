import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { executeGitHubCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { GitHubSearchResult, GitHubDiscussionsSearchParams } from '../../types';
import { createErrorResult, createSuccessResult } from '../util';

export async function searchGitHubDiscussions(
  params: GitHubDiscussionsSearchParams
): Promise<CallToolResult> {
  // Validate required query parameter
  if (!params.query || params.query.trim() === '') {
    return createErrorResult(
      'Search query required',
      new Error(
        'GitHub discussions search requires a non-empty query parameter'
      )
    );
  }

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

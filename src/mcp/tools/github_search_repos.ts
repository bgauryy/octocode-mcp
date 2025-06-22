import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  createErrorResult,
  createResult,
  createSuccessResult,
} from '../../utils/responses';
import { GitHubReposSearchParams } from '../../types';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

const TOOL_NAME = 'github_search_repositories';

const DESCRIPTION = `Search repositories by name/description with powerful filtering. Use topics for discovery, stars for quality, owner for organization focus. Efficient alternative to manual GitHub browsing.`;

export function registerSearchGitHubReposTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            'Search query with GitHub syntax. Optional - can search with primary filters alone.'
          ),

        // PRIMARY FILTERS (can work alone)
        owner: z
          .string()
          .optional()
          .describe('Repository owner/organization for targeted search.'),
        language: z
          .string()
          .optional()
          .describe('Programming language filter.'),
        stars: z
          .string()
          .optional()
          .describe(
            'Stars filter with ranges: ">100", "<50", "10..100". Use >100 for quality.'
          ),
        topic: z
          .array(z.string())
          .optional()
          .describe('Filter by topics for semantic discovery.'),
        forks: z.number().optional().describe('Exact forks count.'),
        numberOfTopics: z
          .number()
          .optional()
          .describe('Filter by number of topics.'),

        // SECONDARY FILTERS
        license: z
          .array(z.string())
          .optional()
          .describe('License types filter.'),
        match: z
          .enum(['name', 'description', 'readme'])
          .optional()
          .describe('Search scope restriction.'),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Repository visibility filter.'),
        created: z
          .string()
          .optional()
          .describe('Created date filter with ranges.'),
        updated: z.string().optional().describe('Updated date filter.'),
        archived: z.boolean().optional().describe('Filter by archived state.'),
        includeForks: z
          .enum(['false', 'true', 'only'])
          .optional()
          .describe('Include forks control.'),
        goodFirstIssues: z
          .string()
          .optional()
          .describe('Filter by good first issues count.'),
        helpWantedIssues: z
          .string()
          .optional()
          .describe('Filter by help wanted issues count.'),
        followers: z.number().optional().describe('Filter by followers count.'),
        size: z.string().optional().describe('Repository size filter in KB.'),

        // Sorting and limits
        sort: z
          .enum([
            'forks',
            'help-wanted-issues',
            'stars',
            'updated',
            'best-match',
          ])
          .optional()
          .default('best-match')
          .describe('Sort criteria (default: best-match)'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Result order (default: desc)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(25)
          .describe('Maximum results (default: 25, max: 50)'),
      },
      annotations: {
        title: 'GitHub Repository Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubReposSearchParams): Promise<CallToolResult> => {
      try {
        // Updated validation logic for primary filters
        const hasPrimaryFilter =
          args.query?.trim() ||
          args.owner ||
          args.language ||
          args.topic ||
          args.stars ||
          args.forks;

        if (!hasPrimaryFilter) {
          return createResult(
            'Requires query or primary filter (owner, language, stars, topic, forks)',
            true
          );
        }

        // Search repositories using GitHub CLI
        const result = await searchGitHubRepos(args);

        return result;
      } catch (error) {
        return createResult(
          'Repository search failed - verify connection or simplify query',
          true
        );
      }
    }
  );
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
      const rawContent = execResult.result;

      // Parse JSON results and provide structured analysis
      let repositories = [];
      const analysis = {
        totalFound: 0,
        languages: new Set<string>(),
        avgStars: 0,
        recentlyUpdated: 0,
        topStarred: [] as Array<{
          name: string;
          stars: number;
          description: string;
          language: string;
          url: string;
          forks: number;
          isPrivate: boolean;
          isArchived: boolean;
          isFork: boolean;
          topics: string[];
          license: string | null;
          hasIssues: boolean;
          openIssuesCount: number;
          createdAt: string;
          updatedAt: string;
          visibility: string;
          owner: string;
        }>,
      };

      // Parse JSON response from GitHub CLI
      repositories = JSON.parse(rawContent);

      if (Array.isArray(repositories) && repositories.length > 0) {
        analysis.totalFound = repositories.length;

        // Analyze repository data
        let totalStars = 0;
        const now = new Date();
        const thirtyDaysAgo = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000
        );

        repositories.forEach(repo => {
          // Collect languages
          if (repo.language) {
            analysis.languages.add(repo.language);
          }

          // Calculate average stars (use correct field name)
          if (repo.stargazersCount) {
            totalStars += repo.stargazersCount;
          }

          // Count recently updated repositories (use correct field name)
          if (repo.updatedAt) {
            const updatedDate = new Date(repo.updatedAt);
            if (updatedDate > thirtyDaysAgo) {
              analysis.recentlyUpdated++;
            }
          }
        });

        analysis.avgStars =
          repositories.length > 0
            ? Math.round(totalStars / repositories.length)
            : 0;

        // Get all repositories with comprehensive data
        analysis.topStarred = repositories.map(repo => ({
          name: repo.fullName || repo.name,
          stars: repo.stargazersCount || 0,
          description: repo.description || 'No description',
          language: repo.language || 'Unknown',
          url: repo.url,
          forks: repo.forksCount || 0,
          isPrivate: repo.isPrivate || false,
          isArchived: repo.isArchived || false,
          isFork: repo.isFork || false,
          topics: [], // GitHub CLI search repos doesn't provide topics in JSON output
          license: repo.license?.name || null,
          hasIssues: repo.hasIssues || false,
          openIssuesCount: repo.openIssuesCount || 0,
          createdAt: repo.createdAt,
          updatedAt: repo.updatedAt,
          visibility: repo.visibility || 'public',
          owner: repo.owner?.login || repo.owner,
        }));
      }

      return createSuccessResult({
        query: params.query,
        total: analysis.totalFound,
        ...(analysis.totalFound > 0
          ? {
              repositories: analysis.topStarred,
              summary: {
                languages: Array.from(analysis.languages).slice(0, 10),
                avgStars: analysis.avgStars,
                recentlyUpdated: analysis.recentlyUpdated,
              },
            }
          : {
              repositories: [],
            }),
      });
    } catch (error) {
      return createErrorResult(
        'Repository search failed - verify connection or simplify query',
        error
      );
    }
  });
}

function buildGitHubReposSearchCommand(params: GitHubReposSearchParams): {
  command: GhCommand;
  args: string[];
} {
  // Build query following GitHub CLI patterns
  const query = params.query?.trim() || '';
  const args = ['repos'];

  // Only add query if it exists and handle it properly
  if (query) {
    // For repository search, treat multi-word queries as a single quoted string
    // This matches GitHub CLI expected behavior for repo searches
    if (query.includes(' ')) {
      args.push(query); // Let GitHub CLI handle the quoting
    } else {
      args.push(query);
    }
  }

  // Add JSON output with specific fields for structured data parsing
  // Note: 'topics' field is not available in GitHub CLI search repos JSON output
  args.push(
    '--json',
    'name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility'
  );

  // PRIMARY FILTERS - Handle owner as single string (BaseSearchParams) or array
  if (params.owner) {
    const ownerValue = Array.isArray(params.owner)
      ? params.owner.join(',')
      : params.owner;
    args.push(`--owner=${ownerValue}`);
  }
  if (params.language) args.push(`--language=${params.language}`);
  if (params.forks !== undefined) args.push(`--forks=${params.forks}`);
  if (params.topic && params.topic.length > 0)
    args.push(`--topic=${params.topic.join(',')}`);
  if (params.numberOfTopics !== undefined)
    args.push(`--number-topics=${params.numberOfTopics}`);

  // Only add stars filter if it's a valid numeric value or range
  if (
    params.stars !== undefined &&
    params.stars !== '*' &&
    params.stars.trim() !== ''
  ) {
    // Validate that stars parameter contains valid numeric patterns
    const starsValue = params.stars.trim();
    const isValidStars = /^(\d+|>\d+|<\d+|\d+\.\.\d+|>=\d+|<=\d+)$/.test(
      starsValue
    );
    if (isValidStars) {
      // Don't add quotes around the stars value - GitHub CLI handles this internally
      args.push(`--stars=${starsValue}`);
    }
  }

  // SECONDARY FILTERS - only add if we have primary filters
  if (params.archived !== undefined) args.push(`--archived=${params.archived}`);
  if (params.created) args.push(`--created=${params.created}`);
  if (params.includeForks) args.push(`--include-forks=${params.includeForks}`);
  if (params.license && params.license.length > 0)
    args.push(`--license=${params.license.join(',')}`);
  if (params.match) args.push(`--match=${params.match}`);
  if (params.updated) args.push(`--updated=${params.updated}`);
  if (params.visibility) args.push(`--visibility=${params.visibility}`);
  if (params.goodFirstIssues)
    args.push(`--good-first-issues=${params.goodFirstIssues}`);
  if (params.helpWantedIssues)
    args.push(`--help-wanted-issues=${params.helpWantedIssues}`);
  if (params.followers !== undefined)
    args.push(`--followers=${params.followers}`);
  if (params.size) args.push(`--size=${params.size}`);

  // SORTING AND LIMITS
  if (params.limit) args.push(`--limit=${params.limit}`);
  if (params.order) args.push(`--order=${params.order}`);

  // Use best-match as default, only specify sort if different from default
  const sortBy = params.sort || 'best-match';
  if (sortBy !== 'best-match') {
    args.push(`--sort=${sortBy}`);
  }

  return { command: 'search', args };
}

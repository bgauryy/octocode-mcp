import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  createErrorResult,
  createSuccessResult,
  formatDateToYYYYMMDD,
} from '../../utils/responses';
import { GitHubReposSearchParams } from '../../types';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

// Define interfaces for the structured success result
interface GhCliRepoOwner {
  login: string;
  id?: string;
  type?: string;
}

// Raw item from GH CLI `search repos --json`
interface GhCliRepoItem {
  fullName?: string;
  name?: string;
  stargazersCount?: number;
  description?: string | null;
  language?: string | null;
  url: string;
  owner?: GhCliRepoOwner | string; // owner can be an object with login, or sometimes just a string
  updatedAt?: string; // ISO date string e.g., "2023-10-26T12:00:00Z"
  forksCount?: number;
  topics?: string[];
  license?: { spdxId?: string; name?: string } | null;
  // Add other fields from `gh search repos --help` JSON FIELDS if needed for analysis
  // createdAt, defaultBranch, hasDownloads, hasIssues, hasPages, hasProjects, hasWiki,
  // homepage, id, isArchived, isDisabled, isFork, isPrivate, openIssuesCount, pushedAt,
  // size, visibility, watchersCount
}

// Processed item for the tool's output
interface GitHubSearchedRepoItem {
  name: string;
  stars: number;
  description: string;
  language: string;
  url: string;
  owner: string;
  updated: string; // Date string "YYYY-MM-DD"
  forks?: number;
  topics?: string[];
}

interface GitHubSearchReposSummary {
  languages: string[];
  averageStars: number;
  recentlyUpdatedCount: number;
}

interface GitHubSearchReposSuccessData {
  query?: string;
  total: number; // Total items returned by the CLI respecting its limit
  summary: GitHubSearchReposSummary;
  repositories: GitHubSearchedRepoItem[];
}

const TOOL_NAME = 'github_search_repositories';

const DESCRIPTION = `Discover repositories for architecture analysis and implementation research. Use quality filters and topic targeting for curated results.`;

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
            'Search terms. Examples: "react hooks", "build tools", "state management". Optional with filters.'
          ),

        // PRIMARY FILTERS (high-value for research)
        owner: z
          .string()
          .optional()
          .describe(
            'Repository owner/organization from api_status_check results. Essential for accessing your private repositories.'
          ),
        language: z
          .string()
          .optional()
          .describe('Programming language. Essential for targeted discovery.'),
        stars: z
          .string()
          .optional()
          .describe(
            'Quality filter. Use ">1000" for established projects, ">10000" for major libraries.'
          ),
        topic: z
          .array(z.string())
          .optional()
          .describe(
            'Topic tags for semantic discovery. Highly effective for research.'
          ),
        forks: z
          .string()
          .optional()
          .describe('Fork count filter (e.g., ">100", "10..50").'),
        numberOfTopics: z
          .string()
          .optional()
          .describe(
            'Minimum topic count for well-documented projects (e.g., ">=3").'
          ),

        // SECONDARY FILTERS
        license: z
          .array(z.string())
          .optional()
          .describe('License types. Important for commercial research.'),
        match: z
          .enum(['name', 'description', 'readme'])
          .optional()
          .describe('Search scope restriction.'),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Repository visibility.'),
        created: z.string().optional().describe('Creation date filter.'),
        updated: z.string().optional().describe('Last update filter.'),
        archived: z
          .boolean()
          .optional()
          .describe('Include/exclude archived repos.'),
        includeForks: z
          .enum(['false', 'true', 'only'])
          .optional()
          .describe('Fork inclusion policy.'),
        goodFirstIssues: z
          .string()
          .optional()
          .describe('Good first issues count.'),
        helpWantedIssues: z
          .string()
          .optional()
          .describe('Help wanted issues count.'),
        followers: z
          .string()
          .optional()
          .describe('Follower count filter (e.g., ">1000").'),
        size: z.string().optional().describe('Repository size in KB.'),

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
          .default('stars')
          .describe('Sort by stars for research quality.'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Sort order.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(15)
          .describe('Max results. Default 15 for research focus.'),
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
        // Research-focused validation
        const hasPrimaryFilter =
          args.query?.trim() ||
          args.owner ||
          args.language ||
          args.topic ||
          args.stars ||
          args.forks;

        if (!hasPrimaryFilter) {
          return createErrorResult(
            'Query or filter required | Try: add search query, owner filter, language filter, or stars filter'
          );
        }

        // Search repositories using GitHub CLI
        const result = await searchGitHubRepos(args);

        return result;
      } catch (error) {
        return createErrorResult(
          'Search failed | Try: simplify query, check connection, or verify GitHub CLI authentication',
          error
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
      let ghCliItems: GhCliRepoItem[];
      try {
        ghCliItems = JSON.parse(result.content[0].text as string);
      } catch (parseError) {
        return createErrorResult(
          'Invalid GitHub CLI response | Try: update GitHub CLI or check installation',
          parseError as Error
        );
      }

      const repositories = Array.isArray(ghCliItems) ? ghCliItems : [];

      // Parse JSON results and provide structured analysis
      const analysis: {
        totalFound: number;
        languages: Set<string>;
        avgStars: number;
        recentlyUpdated: number;
        topStarred: GitHubSearchedRepoItem[];
      } = {
        totalFound: 0,
        languages: new Set<string>(),
        avgStars: 0,
        recentlyUpdated: 0,
        topStarred: [],
      };

      if (repositories.length > 0) {
        analysis.totalFound = repositories.length;

        // Analyze repository data
        let totalStars = 0;
        const now = new Date();
        const thirtyDaysAgo = new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000
        );

        repositories.forEach((repo: GhCliRepoItem) => {
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

        // Get essential repository data only
        analysis.topStarred = repositories.map(
          (repo: GhCliRepoItem): GitHubSearchedRepoItem => ({
            name: repo.fullName || repo.name || 'N/A',
            stars: repo.stargazersCount || 0,
            description: (repo.description || '').substring(0, 150),
            language: repo.language || 'N/A',
            url: repo.url,
            owner:
              typeof repo.owner === 'string'
                ? repo.owner
                : repo.owner?.login || 'N/A',
            updated: formatDateToYYYYMMDD(repo.updatedAt) || 'N/A',
            forks: repo.forksCount,
            topics: repo.topics,
          })
        );
      }

      const successData: GitHubSearchReposSuccessData = {
        query: params.query,
        total: analysis.totalFound,
        summary: {
          languages: Array.from(analysis.languages),
          averageStars: analysis.avgStars,
          recentlyUpdatedCount: analysis.recentlyUpdated,
        },
        repositories: analysis.topStarred,
      };

      return createSuccessResult(successData);
    } catch (error) {
      return createErrorResult(
        'Search failed | Try: simplify query, check connection, or verify GitHub CLI authentication',
        error
      );
    }
  });
}

function buildGitHubReposSearchCommand(params: GitHubReposSearchParams): {
  command: GhCommand;
  args: string[];
} {
  const command: GhCommand = 'search';
  const args: string[] = ['repos'];

  // Query: Either use the provided query or build one from filters
  let searchQuery = params.query?.trim() || '';
  const queryParts: string[] = [];

  // Add specific filters to the query string as gh search repos primarily uses query syntax for these
  if (params.owner) queryParts.push(`user:${params.owner}`); // or org:${params.owner} - user is more general
  if (params.language) queryParts.push(`language:${params.language}`);
  if (params.stars) queryParts.push(`stars:${params.stars}`);
  if (params.forks) queryParts.push(`forks:${params.forks}`);
  if (params.created) queryParts.push(`created:${params.created}`);
  if (params.updated) queryParts.push(`updated:${params.updated}`);
  if (params.license && params.license.length > 0) {
    params.license.forEach(l => queryParts.push(`license:${l}`));
  }
  if (params.topic && params.topic.length > 0) {
    params.topic.forEach(t => queryParts.push(`topic:${t}`));
  }
  if (params.goodFirstIssues)
    queryParts.push(`good-first-issues:${params.goodFirstIssues}`);
  if (params.helpWantedIssues)
    queryParts.push(`help-wanted-issues:${params.helpWantedIssues}`);
  if (params.followers) queryParts.push(`followers:${params.followers}`);
  if (params.numberOfTopics) queryParts.push(`topics:${params.numberOfTopics}`); // e.g. topics:>=5
  if (params.size) queryParts.push(`size:${params.size}`);

  if (typeof params.archived === 'boolean') {
    queryParts.push(`archived:${params.archived}`);
  }
  if (params.includeForks) {
    queryParts.push(
      `fork:${params.includeForks === 'only' ? 'only' : params.includeForks}`
    );
  }
  if (params.visibility) {
    queryParts.push(`is:${params.visibility}`);
  }

  // Combine query parts with the main query
  if (queryParts.length > 0) {
    searchQuery = `${searchQuery} ${queryParts.join(' ')}`.trim();
  }

  if (searchQuery) {
    args.push(searchQuery);
  } else if (
    Object.keys(params).filter(
      k => k !== 'sort' && k !== 'order' && k !== 'limit'
    ).length === 0
  ) {
    // If no query and no other filters (excluding sort, order, limit), it might be an invalid state.
    // However, the initial validation in the calling function should catch empty primary filters.
    // For safety, gh cli might require a query if no other arguments are effectively filters.
    // This case should ideally be handled by the primary filter validation earlier.
  }

  // CLI flags for sorting and limits
  if (params.sort) args.push(`--sort=${params.sort}`);
  if (params.order) args.push(`--order=${params.order}`);
  if (params.limit) args.push(`--limit=${params.limit}`);

  // Match flag if present
  if (params.match) {
    args.push(`--match=${params.match}`);
  }

  // Request necessary JSON fields for analysis and output
  const jsonFields = [
    'fullName',
    'name', // for name
    'stargazersCount', // for stars, avgStars
    'description', // for description
    'language', // for language, languages summary
    'url', // for url
    'owner', // for owner
    'updatedAt', // for updated, recentlyUpdatedCount
    'forksCount', // for forks in output item
    'topics', // for topics in output item
    'license', // potentially useful, for GhCliRepoItem
    // Add other fields if they become part of analysis or output:
    // 'createdAt', 'defaultBranch', 'hasIssues', 'openIssuesCount', 'pushedAt', 'size', 'visibility'
  ];
  args.push(`--json=${jsonFields.join(',')}`);

  return { command, args };
}

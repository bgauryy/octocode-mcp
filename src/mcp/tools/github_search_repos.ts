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

// Raw item from GH CLI `search repos --json` - simplified to match actual CLI fields
interface GhCliRepoItem {
  fullName: string;
  name: string;
  stargazersCount: number;
  description?: string | null;
  language?: string | null;
  url: string;
  owner: { login: string };
  updatedAt: string;
  forksCount?: number;
  license?: { name?: string } | null;
}

// Processed item for the tool's output
interface GitHubSearchedRepoItem {
  name: string;
  stars: number;
  description: string;
  language: string;
  url: string;
  owner: string;
  updated: string;
  forks: number;
}

interface GitHubSearchReposSuccessData {
  query: string;
  total: number;
  repositories: GitHubSearchedRepoItem[];
}

const TOOL_NAME = 'github_search_repositories';

const DESCRIPTION = `Discover repositories for architecture analysis and implementation research. Use quality filters and topic targeting for curated results.

SEARCH STRATEGY:
• Individual terms work best: "react hooks" finds repos with both terms (AND logic)
• Use OR for alternatives: "webpack OR vite", "vue OR angular" 
• Quality filters essential: stars>1000 for established projects, >10000 for major libraries
• Language filter more effective than query complexity: prefer --language over "language:X"
• Owner targeting from api_status_check results enables private repo access

EXAMPLES:
• Framework research: query="state management" language="javascript" stars=">1000"
• Architecture study: query="microservices" language="go" owner="google"  
• Library comparison: query="testing OR test" language="typescript" stars=">500"
• Recent projects: query="machine learning" updated=">2023-01-01" stars=">100"

ANTI-PATTERNS:
❌ Overly complex queries: "concurrent rendering scheduler implementation"
✅ Simple terms: "scheduler", "workloop", "concurrent"
❌ No quality filters → noise
✅ Apply stars/activity filters early
❌ Broad search without context
✅ Use owner parameter from api_status_check`;

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
            'Search terms - USE INDIVIDUAL TERMS for best results. GitHub searches for ALL terms by default (AND logic). EFFECTIVE PATTERNS: (1) Individual terms: "react hooks", "machine learning", "web framework" (searches for repos containing ALL these terms); (2) Exact phrases: "exact phrase" (use quotes sparingly); (3) OR logic: "vue OR angular" (explicit OR for alternatives); (4) Exclusion: "react -tutorial" (exclude tutorials). AVOID: Complex boolean expressions. If zero results: try fewer terms, broader terms, or remove quotes. Examples: "react", "machine learning", "testing framework", "vue OR angular"'
          ),

        // PRIMARY FILTERS
        owner: z
          .string()
          .optional()
          .describe(
            'Repository owner/organization from api_status_check results. Examples: "microsoft", "google", "facebook".'
          ),
        language: z
          .string()
          .optional()
          .describe(
            'Programming language filter. Examples: "javascript", "typescript", "python".'
          ),
        stars: z
          .string()
          .optional()
          .describe(
            'Star count filter. Use ">1000" for established projects, ">10000" for major libraries, "100..1000" for ranges.'
          ),
        topic: z
          .array(z.string())
          .optional()
          .describe(
            'Topic tags for semantic discovery. Example: ["web-framework", "javascript"].'
          ),
        forks: z
          .string()
          .optional()
          .describe('Fork count filter. Examples: ">100", "10..50".'),

        // SECONDARY FILTERS
        license: z
          .array(z.string())
          .optional()
          .describe('License types. Examples: ["mit", "apache-2.0"].'),
        archived: z
          .boolean()
          .optional()
          .describe('Include/exclude archived repositories.'),
        created: z
          .string()
          .optional()
          .describe(
            'Creation date filter. Examples: ">2020-01-01", "<2023-12-31".'
          ),
        updated: z
          .string()
          .optional()
          .describe('Last update filter. Examples: ">2023-01-01".'),
        size: z
          .string()
          .optional()
          .describe('Repository size in KB. Examples: ">1000", "<500".'),
        followers: z
          .string()
          .optional()
          .describe('Follower count filter. Examples: ">1000".'),
        'good-first-issues': z
          .string()
          .optional()
          .describe('Good first issues count. Examples: ">=3".'),
        'help-wanted-issues': z
          .string()
          .optional()
          .describe('Help wanted issues count. Examples: ">=5".'),
        'include-forks': z
          .enum(['false', 'true', 'only'])
          .optional()
          .describe('Fork inclusion policy.'),
        match: z
          .enum(['name', 'description', 'readme'])
          .optional()
          .describe('Search scope restriction.'),
        'number-topics': z
          .string()
          .optional()
          .describe('Minimum topic count. Examples: ">=3".'),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Repository visibility filter.'),

        // SORTING AND LIMITS
        sort: z
          .enum(['forks', 'help-wanted-issues', 'stars', 'updated'])
          .optional()
          .default('stars')
          .describe('Sort criteria. Default: stars.'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Sort order. Default: desc.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(15)
          .describe('Maximum results. Default: 15.'),
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
        // Validation: require at least one filter
        const hasFilter =
          args.query?.trim() ||
          args.owner ||
          args.language ||
          args.topic ||
          args.stars ||
          args.forks;

        if (!hasFilter) {
          return createErrorResult(
            'Query or filter required | Try: add search query, owner, language, stars, or topic filter'
          );
        }

        return await searchGitHubRepos(args);
      } catch (error) {
        return createErrorResult(
          'Search failed | Try: simplify query, check connection, or verify authentication',
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

      // Parse the CLI response
      let ghCliItems: GhCliRepoItem[];
      try {
        const execResult = JSON.parse(result.content[0].text as string);
        ghCliItems = JSON.parse(execResult.result);
      } catch (parseError) {
        return createErrorResult(
          'Invalid GitHub CLI response | Try: update GitHub CLI or check installation',
          parseError as Error
        );
      }

      const repositories = Array.isArray(ghCliItems) ? ghCliItems : [];

      // Process repository data
      const processedRepos: GitHubSearchedRepoItem[] = repositories.map(
        (repo: GhCliRepoItem): GitHubSearchedRepoItem => ({
          name: repo.fullName,
          stars: repo.stargazersCount,
          description: repo.description?.substring(0, 150) || '',
          language: repo.language || 'N/A',
          url: repo.url,
          owner: repo.owner.login,
          updated: formatDateToYYYYMMDD(repo.updatedAt) || 'N/A',
          forks: repo.forksCount || 0,
        })
      );

      const successData: GitHubSearchReposSuccessData = {
        query: params.query || '',
        total: repositories.length,
        repositories: processedRepos,
      };

      return createSuccessResult(successData);
    } catch (error) {
      return createErrorResult(
        'Search failed | Try: simplify query, check connection, or verify authentication',
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

  // Add the main query if provided
  if (params.query?.trim()) {
    args.push(params.query.trim());
  }

  // Add CLI flags that match the actual CLI API
  if (params.owner) args.push(`--owner=${params.owner}`);
  if (params.language) args.push(`--language=${params.language}`);
  if (params.stars) args.push(`--stars=${params.stars}`);
  if (params.forks) args.push(`--forks=${params.forks}`);
  if (params.created) args.push(`--created=${params.created}`);
  if (params.updated) args.push(`--updated=${params.updated}`);
  if (params.size) args.push(`--size=${params.size}`);
  if (params.followers) args.push(`--followers=${params.followers}`);

  // Handle array parameters
  if (params.license && params.license.length > 0) {
    args.push(`--license=${params.license.join(',')}`);
  }
  if (params.topic && params.topic.length > 0) {
    args.push(`--topic=${params.topic.join(',')}`);
  }

  // Handle special parameter names that have hyphens
  if (params['good-first-issues']) {
    args.push(`--good-first-issues=${params['good-first-issues']}`);
  }
  if (params['help-wanted-issues']) {
    args.push(`--help-wanted-issues=${params['help-wanted-issues']}`);
  }
  if (params['include-forks']) {
    args.push(`--include-forks=${params['include-forks']}`);
  }
  if (params['number-topics']) {
    args.push(`--number-topics=${params['number-topics']}`);
  }

  // Handle boolean parameters
  if (typeof params.archived === 'boolean') {
    args.push(`--archived=${params.archived}`);
  }
  if (params.visibility) {
    args.push(`--visibility=${params.visibility}`);
  }
  if (params.match) {
    args.push(`--match=${params.match}`);
  }

  // Add sorting and limits
  if (params.sort) args.push(`--sort=${params.sort}`);
  if (params.order) args.push(`--order=${params.order}`);
  if (params.limit) args.push(`--limit=${params.limit}`);

  // Request JSON fields
  const jsonFields = [
    'fullName',
    'name',
    'stargazersCount',
    'description',
    'language',
    'url',
    'owner',
    'updatedAt',
    'forksCount',
    'license',
  ];
  args.push(`--json=${jsonFields.join(',')}`);

  return { command, args };
}

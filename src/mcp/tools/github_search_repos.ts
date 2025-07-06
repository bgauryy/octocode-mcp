import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult, toDDMMYYYY } from '../responses';
import { GitHubReposSearchParams } from '../../types';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  createNoResultsError,
  createSearchFailedError,
} from '../errorMessages';

export const GITHUB_SEARCH_REPOSITORIES_TOOL_NAME = 'githubSearchRepositories';

const DESCRIPTION = `Search GitHub repositories using gh search repos CLI.

BEST PRACTICES:
- Use topics for unknown domains to explore repositories by TOPIC
- Use owner to explore repositories by ORGANIZATION
- Search by name and sort by best match / starts to search specific repositories 
- Use language to explore repositories by LANGUAGE
- Use quality filters (stars, forks) for refinement
- Use limit to control the number of repositories to return

Seperate queries for different topics and repositories search and use minimal filters to get the most relevant results`;

/**
 * Extract owner/repo information from various query formats
 */
function extractOwnerRepoFromQuery(query: string): {
  extractedOwner?: string;
  extractedRepo?: string;
  cleanedQuery: string;
} {
  let cleanedQuery = query;
  let extractedOwner: string | undefined;
  let extractedRepo: string | undefined;

  const patterns = [
    // Pattern 1: GitHub URLs (https://github.com/owner/repo)
    /github\.com\/([^\\s]+)\/([^\\s]+)/i,
    // Pattern 2: owner/repo format in query
    /\b([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\/([a-zA-Z0-9][a-zA-Z0-9\-.]*[a-zA-Z0-9])\b/,
    // Pattern 3: NPM package-like references (@scope/package)
    /@([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\/([a-zA-Z0-9][a-zA-Z0-9\-.]*[a-zA-Z0-9])/,
  ];

  for (const pattern of patterns) {
    const match = cleanedQuery.match(pattern);
    if (match) {
      extractedOwner = match[1];
      extractedRepo = match[2];
      cleanedQuery = cleanedQuery.replace(match[0], '').trim();
      break; // Stop after the first successful match
    }
  }

  return {
    extractedOwner,
    extractedRepo,
    cleanedQuery: cleanedQuery || query, // Ensure original query is returned if cleaned is empty
  };
}

export function registerSearchGitHubReposTool(server: McpServer) {
  server.registerTool(
    GITHUB_SEARCH_REPOSITORIES_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe(
            'Search query with AND logic between terms. Multiple words require ALL to be present. Use quotes for exact phrases. Examples: "cli shell", "vim plugin". For negation, use embedded qualifiers like "topic:react -topic:vue". Advanced: supports GitHub search qualifiers (stars:>100, language:python, etc.)'
          ),

        // CORE FILTERS (GitHub CLI flags)
        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository owner/organization name(s) (e.g., "facebook", ["google", "microsoft"]). Search within specific organizations. Do NOT use owner/repo format - just the organization/username.'
          ),
        language: z
          .string()
          .optional()
          .describe(
            'Programming language filter. Filters repositories by primary language. Essential for language-specific searches.'
          ),
        stars: z
          .union([
            z.number().int().min(0),
            z
              .string()
              .regex(
                /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
                'Invalid format. Use: ">1000", ">=500", "<100", "<=50", "10..100", or exact number "50"'
              ),
          ])
          .optional()
          .describe(
            'Star count filter. Format: ">1000" (more than), ">=500" (more than or equal), "<100" (less than), "<=50" (less than or equal), "100..1000" (range), "500" (exact).'
          ),
        topic: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            '🎯 BEST FOR EXPLORATION: Repository topics filter. Use for discovering projects in unknown domains. Format: single topic "react" or array ["unix", "terminal"]. Topics use kebab-case format.'
          ),
        forks: z
          .union([
            z.number().int().min(0),
            z
              .string()
              .regex(
                /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
                'Invalid format. Use: ">100", ">=50", "<10", "<=5", "10..100", or exact number "5"'
              ),
          ])
          .optional()
          .describe(
            'Fork count filter. Format: ">100" (more than), ">=50" (more than or equal), "<10" (less than), "<=5" (less than or equal), "10..100" (range), "5" (exact).'
          ),

        // Match CLI parameter name exactly
        'number-topics': z
          .union([
            z.number().int().min(0),
            z
              .string()
              .regex(
                /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
                'Invalid format. Use: ">5", ">=3", "<10", "<=2", "3..10", or exact number "5"'
              ),
          ])
          .optional()
          .describe(
            'Number of topics filter. Format: ">5" (many topics), ">=3" (at least 3), "<10" (few topics), "1..3" (range), "5" (exact).'
          ),

        // QUALITY & STATE FILTERS
        license: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'License filter. Examples: "mit", "apache-2.0", ["mit", "bsd-3-clause"]'
          ),
        archived: z
          .boolean()
          .optional()
          .describe(
            'Archive status filter. false (active repos only), true (archived repos only).'
          ),
        'include-forks': z
          .enum(['false', 'true', 'only'])
          .optional()
          .describe(
            'Fork inclusion. "false" (exclude forks), "true" (include forks), "only" (forks only).'
          ),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Repository visibility.'),

        // DATE & SIZE FILTERS
        created: z
          .string()
          .regex(
            /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/,
            'Invalid date format. Use: ">2020-01-01", ">=2020-01-01", "<2023-12-31", "<=2023-12-31", "2020-01-01..2023-12-31", or exact date "2023-01-01"'
          )
          .optional()
          .describe(
            'Repository creation date filter. Format: ">2020-01-01" (after), ">=2020-01-01" (on or after), "<2023-12-31" (before), "<=2023-12-31" (on or before), "2020-01-01..2023-12-31" (range), "2023-01-01" (exact).'
          ),
        updated: z
          .string()
          .regex(
            /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/,
            'Invalid date format. Use: ">2024-01-01", ">=2024-01-01", "<2022-01-01", "<=2022-01-01", "2023-01-01..2024-12-31", or exact date "2024-01-01"'
          )
          .optional()
          .describe(
            'Last updated date filter. Format: ">2024-01-01" (recently updated), ">=2024-01-01" (on or after), "<2022-01-01" (not recently updated), "2023-01-01..2024-12-31" (range).'
          ),
        size: z
          .string()
          .regex(
            /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
            'Invalid size format. Use: ">1000", ">=500", "<100", "<=50", "100..1000", or exact number "500"'
          )
          .optional()
          .describe(
            'Repository size filter in KB. Format: ">1000" (large projects), ">=500" (medium-large), "<100" (small projects), "<=50" (tiny), "100..1000" (medium range), "500" (exact).'
          ),

        // COMMUNITY FILTERS - Match CLI parameter names exactly
        'good-first-issues': z
          .union([
            z.number().int().min(0),
            z
              .string()
              .regex(
                /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
                'Invalid format. Use: number, ">5", ">=10", "<20", "<=15", or "5..20"'
              ),
          ])
          .optional()
          .describe(
            'Good first issues count. Format: ">5" (many beginner issues), "1..10" (some beginner issues).'
          ),
        'help-wanted-issues': z
          .union([
            z.number().int().min(0),
            z
              .string()
              .regex(
                /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
                'Invalid format. Use: number, ">5", ">=10", "<20", "<=15", or "5..20"'
              ),
          ])
          .optional()
          .describe(
            'Help wanted issues count. Format: ">10" (many help wanted), "1..5" (some help wanted).'
          ),
        followers: z
          .union([
            z.number().int().min(0),
            z
              .string()
              .regex(
                /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
                'Invalid format. Use: ">1000", ">=500", "<100", "<=50", "100..1000", or exact number "500"'
              ),
          ])
          .optional()
          .describe(
            'Repository owner followers count. Format: ">1000" (popular developers), ">=500" (established developers), "<100" (smaller developers), "100..1000" (range).'
          ),

        // SEARCH SCOPE - Match CLI exactly
        match: z
          .union([
            z.enum(['name', 'description', 'readme']),
            z.array(z.enum(['name', 'description', 'readme'])),
          ])
          .optional()
          .describe(
            'Search scope. "name" (repository names only), "description" (descriptions only), "readme" (README content). Can be single value or array.'
          ),

        // SORTING & LIMITS - Match CLI defaults exactly
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
          .describe('Sort criteria.'),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Sort order direction.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(30)
          .describe('Maximum number of repositories to return (1-100).'),
      },
      annotations: {
        title: 'GitHub Repository Search',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args): Promise<CallToolResult> => {
      try {
        // Extract owner/repo from query if present
        const queryInfo = args.query
          ? extractOwnerRepoFromQuery(args.query)
          : {
              cleanedQuery: '',
              extractedOwner: undefined,
              extractedRepo: undefined,
            };

        // Merge extracted owner with explicit owner parameter
        let finalOwner = args.owner;
        if (queryInfo.extractedOwner && !finalOwner) {
          finalOwner = queryInfo.extractedOwner;
        }

        // Update parameters with extracted information
        const enhancedArgs: GitHubReposSearchParams = {
          ...args,
          query: queryInfo.cleanedQuery || args.query,
          owner: finalOwner,
        };

        // Enhanced validation logic for primary filters
        const hasPrimaryFilter =
          enhancedArgs.query?.trim() ||
          enhancedArgs.owner ||
          enhancedArgs.language ||
          enhancedArgs.topic ||
          enhancedArgs.stars ||
          enhancedArgs.forks;

        if (!hasPrimaryFilter) {
          return createResult({
            error: `Repository search requires at least one filter. Try these patterns:
• Topic exploration: { topic: ["react", "typescript"] }
• Organization search: { owner: "microsoft", visibility: "public" }
• Language + quality: { language: "go", "good-first-issues": ">=10" }
• Simple query: { query: "cli shell" }`,
          });
        }

        // First attempt: Search with current parameters
        const result = await searchGitHubRepos(enhancedArgs);

        if (result.isError) {
          const errorMsg = (result.content?.[0]?.text as string) || '';

          // Smart fallbacks based on error type
          if (errorMsg.includes('rate limit')) {
            return createResult({
              error: `GitHub API rate limit. Smart alternatives:
• Try npm package search for package discovery
• Use broader filters (remove stars/forks constraints)
• Search fewer organizations at once
• Wait 5-10 minutes and retry`,
            });
          }

          if (errorMsg.includes('authentication')) {
            return createResult({
              error: `Authentication required. Quick fix:
1. Run: gh auth login
2. For private repos: use api_status_check to verify access
3. Public repos should work without auth - check query`,
            });
          }

          return result; // Return original error for other cases
        }

        // Check if we got results
        const resultData = JSON.parse(result.content[0].text as string);
        const hasResults = resultData.total_count > 0;

        // Smart fallback strategies for no results
        if (!hasResults) {
          const fallbackSuggestions = [];

          if (enhancedArgs.query) {
            fallbackSuggestions.push(
              '• Try broader search terms or remove query filter'
            );
          }

          if (enhancedArgs.language) {
            fallbackSuggestions.push(
              '• Remove language filter for broader discovery'
            );
          }

          if (enhancedArgs.stars || enhancedArgs.forks) {
            fallbackSuggestions.push(
              '• Lower quality thresholds (stars/forks)'
            );
          }

          if (!enhancedArgs.topic) {
            fallbackSuggestions.push(
              '• 🎯 Try topic exploration: { topic: ["web", "api"] }'
            );
          }

          if (enhancedArgs.owner) {
            fallbackSuggestions.push(
              '• Search without owner filter for global discovery'
            );
            fallbackSuggestions.push(
              '• Use npm package search if looking for packages'
            );
          }

          return createResult({
            error: `No repositories found. Try these alternatives:
${fallbackSuggestions.join('\n')}

Quick discovery patterns:
• 🎯 Topic exploration: { topic: ["react"] }
• Organization search: { owner: "microsoft" }
• Quality filter: { stars: ">100", language: "python" }`,
          });
        }

        // Fallback for private repositories: If no results and owner is specified, try with private visibility
        if (enhancedArgs.owner && !enhancedArgs.visibility) {
          // Try searching with private visibility for organization repos
          const privateSearchArgs: GitHubReposSearchParams = {
            ...enhancedArgs,
            visibility: 'private' as const,
          };

          const privateResult = await searchGitHubRepos(privateSearchArgs);
          if (!privateResult.isError) {
            const privateData = JSON.parse(
              privateResult.content[0].text as string
            );
            if (privateData.total_count > 0) {
              // Return private results with note
              return createResult({
                data: {
                  ...privateData,
                  note: 'Found results in private repositories within the specified organization.',
                },
              });
            }
          }
        }

        return result;
      } catch (error) {
        return createResult({
          error: createSearchFailedError('repositories'),
        });
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

      const execResult = JSON.parse(result.content[0].text as string);
      const repositories = execResult.result;

      if (!Array.isArray(repositories) || repositories.length === 0) {
        return createResult({
          error: createNoResultsError('repositories'),
        });
      }

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

      analysis.totalFound = repositories.length;

      // Analyze repository data
      let totalStars = 0;
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      repositories.forEach(repo => {
        // Collect languages
        if (repo.language) {
          analysis.languages.add(repo.language);
        }

        // Calculate average stars (use correct field name)
        if (typeof repo.stargazersCount === 'number') {
          totalStars += repo.stargazersCount;
        }

        // Count recently updated repositories (use correct field name)
        if (repo.updatedAt) {
          const updatedDate = new Date(repo.updatedAt);
          if (!isNaN(updatedDate.getTime()) && updatedDate > thirtyDaysAgo) {
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
        createdAt: toDDMMYYYY(repo.createdAt),
        updatedAt: toDDMMYYYY(repo.updatedAt),
        visibility: repo.visibility || 'public',
        owner: repo.owner?.login || repo.owner,
      }));

      return createResult({
        data: {
          total_count: analysis.totalFound,
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
        },
      });
    } catch (error) {
      return createResult({
        error: createSearchFailedError('repositories'),
      });
    }
  });
}

function buildGitHubReposSearchCommand(params: GitHubReposSearchParams): {
  command: GhCommand;
  args: string[];
} {
  const query = params.query?.trim() || '';
  const args = ['repos'];

  const hasEmbeddedQualifiers =
    query &&
    /\b(stars|language|org|repo|topic|user|created|updated|size|license|archived|fork|good-first-issues|help-wanted-issues):/i.test(
      query
    );

  if (query) {
    args.push(query);
  }

  args.push(
    '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility'
  );

  type ParamName = keyof GitHubReposSearchParams;

  const addArg = (
    paramName: ParamName,
    cliFlag: string,
    condition: boolean = true,
    formatter?: (value: any) => string
  ) => {
    const value = params[paramName];
    if (value !== undefined && condition) {
      if (Array.isArray(value)) {
        args.push(`--${cliFlag}=${value.join(',')}`);
      } else if (formatter) {
        args.push(`--${cliFlag}=${formatter(value)}`);
      } else {
        args.push(`--${cliFlag}=${value.toString()}`);
      }
    }
  };

  // CORE FILTERS
  addArg('owner', 'owner', !hasEmbeddedQualifiers);
  addArg('language', 'language', !hasEmbeddedQualifiers);
  addArg('forks', 'forks', !hasEmbeddedQualifiers, value =>
    typeof value === 'number' ? value.toString() : value.trim()
  );
  addArg('topic', 'topic', !hasEmbeddedQualifiers);
  addArg('number-topics', 'number-topics', true, value =>
    typeof value === 'number' ? value.toString() : value.trim()
  );

  addArg('stars', 'stars', !hasEmbeddedQualifiers, value =>
    typeof value === 'number' ? value.toString() : value.trim()
  );

  // QUALITY & STATE FILTERS
  addArg('archived', 'archived');
  addArg('include-forks', 'include-forks');
  addArg('visibility', 'visibility');
  addArg('license', 'license');

  // DATE & SIZE FILTERS
  addArg('created', 'created');
  addArg('updated', 'updated');
  addArg('size', 'size');

  // COMMUNITY FILTERS
  addArg('good-first-issues', 'good-first-issues', true, value =>
    typeof value === 'number' ? value.toString() : value
  );
  addArg('help-wanted-issues', 'help-wanted-issues', true, value =>
    typeof value === 'number' ? value.toString() : value
  );
  addArg('followers', 'followers', true, value =>
    typeof value === 'number' ? value.toString() : value.trim()
  );

  // SEARCH SCOPE
  addArg('match', 'match');

  // SORTING AND LIMITS
  const sortBy = params.sort || 'best-match';
  if (sortBy !== 'best-match') {
    args.push(`--sort=${sortBy}`);
  }

  addArg('order', 'order');

  // Always add limit with default of 30
  const limit = params.limit || 30;
  args.push(`--limit=${limit}`);

  return { command: 'search', args };
}

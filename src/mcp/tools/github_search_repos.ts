import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult, toDDMMYYYY } from '../responses';
import { GitHubReposSearchParams } from '../../types';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import {
  SUGGESTIONS,
  createNoResultsError,
  createSearchFailedError,
} from '../errorMessages';

/**
 * GitHub Repository Search Tool
 *
 * MOST EFFECTIVE PATTERNS (based on testing):
 *
 * 1. Quality Discovery:
 * { topic: ["react", "typescript"], stars: "1000..5000", limit: 10 }
 *
 * 2. Organization Research:
 * { owner: ["microsoft", "google"], language: "python", limit: 10 }
 *
 * 3. Beginner Projects:
 * { goodFirstIssues: ">=5", stars: "100..5000", limit: 10 }
 *
 * 4. Recent Quality:
 * { stars: ">1000", created: ">2023-01-01", limit: 10 }
 *
 * AVOID: OR queries + language filter, 5+ filters, multi-word OR
 * TIP: Use limit parameter instead of adding more filters
 */

export const GITHUB_SEARCH_REPOSITORIES_TOOL_NAME = 'githubSearchRepositories';

const DESCRIPTION = `Search GitHub repositories using GitHub's repository search API with comprehensive filtering.

Search Logic (AND operation for multiple terms):
- Multiple words: "react typescript" → repositories containing BOTH "react" AND "typescript"
- Exact phrases: "web framework" → repositories with exact phrase "web framework"
- Mixed: "machine learning" python → exact phrase "machine learning" AND word "python"
- Filter combinations: language:javascript stars:>1000 → JavaScript repos with 1000+ stars

Supported Filters: language, stars (ranges), topics, owner/org, license, dates (created/updated), 
size, forks, community metrics (good-first-issues, help-wanted), archived status, visibility.

Examples:
- Popular projects: stars:">1000" language:typescript
- Beginner-friendly: good-first-issues:">5" stars:"100..5000"
- Recent quality: created:">2023-01-01" stars:">500"
- Organization repos: owner:microsoft language:python`;

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
            'Search query with AND logic between terms. Multiple words require ALL to be present. Use quotes for exact phrases. Examples: react typescript (both words), "web framework" (exact phrase), "machine learning" python (phrase + word).'
          ),

        // CORE FILTERS (GitHub CLI flags)
        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository owner or organization name(s). Format: "microsoft" or ["facebook", "google"]. Do NOT use owner/repo format. Dramatically narrows search scope to specific organizations.'
          ),
        language: z
          .string()
          .optional()
          .describe(
            'Programming language filter (javascript, python, typescript, go, etc). Filters repositories by primary language. Essential for language-specific searches.'
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
            'Star count filter. Format: ">1000" (more than), ">=500" (more than or equal), "<100" (less than), "<=50" (less than or equal), "100..1000" (range), "500" (exact). Examples from docs: ">1000", "100..5000", "<100"'
          ),
        topic: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository topics filter. Examples: "machine-learning", ["react", "typescript"]. Topics use kebab-case format (machine-learning, web-development).'
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
            'Fork count filter. Format: ">100" (more than), ">=50" (more than or equal), "<10" (less than), "<=5" (less than or equal), "10..100" (range), "5" (exact). Examples from docs: ">100", "10..100", "<10"'
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
            'Number of topics filter. Format: ">5" (many topics), ">=3" (at least 3), "<10" (few topics), "1..3" (range), "5" (exact). Well-documented projects typically have 3-10 topics.'
          ),

        // QUALITY & STATE FILTERS
        license: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'License filter. Examples: "mit", "apache-2.0", ["mit", "apache-2.0"]. Common licenses: mit, apache-2.0, gpl-3.0, bsd-3-clause.'
          ),
        archived: z
          .boolean()
          .optional()
          .describe(
            'Archive status filter. false (active repos only), true (archived repos only). Use false to find actively maintained projects.'
          ),
        'include-forks': z
          .enum(['false', 'true', 'only'])
          .optional()
          .describe(
            'Fork inclusion. "false" (exclude forks), "true" (include forks), "only" (forks only). Use "false" for original projects.'
          ),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe(
            'Repository visibility. "public" (open source), "private" (private repos you have access to), "internal" (organization internal).'
          ),

        // DATE & SIZE FILTERS
        created: z
          .string()
          .regex(
            /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/,
            'Invalid date format. Use: ">2020-01-01", ">=2020-01-01", "<2023-12-31", "<=2023-12-31", "2020-01-01..2023-12-31", or exact date "2023-01-01"'
          )
          .optional()
          .describe(
            'Repository creation date filter. Format: ">2020-01-01" (after), ">=2020-01-01" (on or after), "<2023-12-31" (before), "<=2023-12-31" (on or before), "2020-01-01..2023-12-31" (range), "2023-01-01" (exact). Examples from docs: ">2020-01-01", "2023-01-01..2023-12-31"'
          ),
        updated: z
          .string()
          .regex(
            /^(>=?\d{4}-\d{2}-\d{2}|<=?\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})$/,
            'Invalid date format. Use: ">2024-01-01", ">=2024-01-01", "<2022-01-01", "<=2022-01-01", "2023-01-01..2024-12-31", or exact date "2024-01-01"'
          )
          .optional()
          .describe(
            'Last updated date filter. Format: ">2024-01-01" (recently updated), ">=2024-01-01" (on or after), "<2022-01-01" (not recently updated), "2023-01-01..2024-12-31" (range). Essential for finding actively maintained projects. Examples from docs: ">2024-01-01", "2022-01-01..2023-12-31"'
          ),
        size: z
          .string()
          .regex(
            /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
            'Invalid size format. Use: ">1000", ">=500", "<100", "<=50", "100..1000", or exact number "500"'
          )
          .optional()
          .describe(
            'Repository size filter in KB. Format: ">1000" (large projects), ">=500" (medium-large), "<100" (small projects), "<=50" (tiny), "100..1000" (medium range), "500" (exact). Examples from docs: ">1000", "100..1000", "<100"'
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
            'Good first issues count. Format: ">5" (many beginner issues), "1..10" (some beginner issues). Perfect for finding beginner-friendly open source projects.'
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
            'Help wanted issues count. Format: ">10" (many help wanted), "1..5" (some help wanted). Great for finding projects actively seeking contributors.'
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
            'Repository owner followers count. Format: ">1000" (popular developers), ">=500" (established developers), "<100" (smaller developers), "100..1000" (range). Indicates developer/org reputation.'
          ),

        // SEARCH SCOPE
        match: z
          .enum(['name', 'description', 'readme'])
          .optional()
          .describe(
            'Search scope. "name" (repository names only), "description" (descriptions only), "readme" (README content). Default searches all fields.'
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
          .describe(
            'Sort criteria. "stars" (popularity), "updated" (recent activity), "forks" (community engagement), "help-wanted-issues" (contribution opportunities), "best-match" (relevance).'
          ),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe(
            'Sort order direction. "desc" (descending, highest first), "asc" (ascending, lowest first). Default is descending for most useful results.'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(30)
          .describe(
            'Maximum number of repositories to return (1-100). Default: 30. Higher values may increase response time.'
          ),
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
            error: SUGGESTIONS.REPO_SEARCH_PRIMARY_FILTER,
          });
        }

        // First attempt: Search with current parameters
        const result = await searchGitHubRepos(enhancedArgs);

        // Fallback for private repositories: If no results and owner is specified, try with private visibility
        if (!result.isError) {
          const resultData = JSON.parse(result.content[0].text as string);
          if (
            resultData.total === 0 &&
            enhancedArgs.owner &&
            !enhancedArgs.visibility
          ) {
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
              if (privateData.total > 0) {
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
  addArg('limit', 'limit');
  addArg('order', 'order');

  const sortBy = params.sort || 'best-match';
  if (sortBy !== 'best-match') {
    args.push(`--sort=${sortBy}`);
  }

  return { command: 'search', args };
}

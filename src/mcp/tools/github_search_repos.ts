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
import { withSecurityValidation } from './utils/withSecurityValidation';

export const GITHUB_SEARCH_REPOSITORIES_TOOL_NAME = 'githubSearchRepositories';

const DESCRIPTION = `Search GitHub repositories using gh search repos CLI.

THREE SEARCH APPROACHES:
- exactQuery: Single exact phrase/word search
- queryTerms: Multiple search terms (broader coverage)  
- topic: Find repositories by technology/subject

BEST PRACTICES:
- Use exactQuery for specific repository names
- Use queryTerms with minimal words for broader results
- Use topic for technology/subject discovery
- Use owner for organization exploration
- Use filters (language, stars, forks) for refinement

Multiple focused searches work better than complex single queries.`;

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
        exactQuery: z
          .string()
          .optional()
          .describe('Single exact phrase/word search'),

        queryTerms: z
          .array(z.string())
          .optional()
          .describe('Multiple search terms for broader coverage'),

        // CORE FILTERS (GitHub CLI flags)
        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository owner/organization name(s). Search within specific organizations or users.'
          ),
        language: z
          .string()
          .optional()
          .describe(
            'Programming language filter. Filters repositories by primary language.'
          ),
        stars: z
          .union([
            z.number().int().min(0),
            z
              .string()
              .regex(
                /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
                'Invalid format. Use: ">N", ">=N", "<N", "<=N", "N..M", or exact number'
              ),
          ])
          .optional()
          .describe(
            'Star count filter. Format: ">N" (more than), "<N" (less than), "N..M" (range).'
          ),
        topic: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Find repositories by technology/subject'),
        forks: z
          .union([
            z.number().int().min(0),
            z
              .string()
              .regex(
                /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
                'Invalid format. Use: ">N", ">=N", "<N", "<=N", "N..M", or exact number'
              ),
          ])
          .optional()
          .describe(
            'Fork count filter. Format: ">N" (more than), "<N" (less than), "N..M" (range).'
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
          .describe('License filter. Filter repositories by license type.'),
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
            'Search scope. Where to search: name, description, or readme content.'
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
    withSecurityValidation(
      async (args: GitHubReposSearchParams): Promise<CallToolResult> => {
        // Validate that exactly one search parameter is provided (not both)
        const hasExactQuery = !!args.exactQuery;
        const hasQueryTerms = args.queryTerms && args.queryTerms.length > 0;

        if (hasExactQuery && hasQueryTerms) {
          return createResult({
            error:
              'Use either exactQuery OR queryTerms, not both. Choose one search approach.',
          });
        }

        try {
          // Extract owner/repo from query if present
          const queryInfo = args.exactQuery
            ? extractOwnerRepoFromQuery(args.exactQuery)
            : args.queryTerms
              ? {
                  cleanedQuery: args.queryTerms.join(' '),
                  extractedOwner: undefined,
                  extractedRepo: undefined,
                }
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
            exactQuery: args.exactQuery ? queryInfo.cleanedQuery : undefined,
            queryTerms: args.queryTerms,
            owner: finalOwner,
          };

          // Enhanced validation logic for primary filters
          const hasPrimaryFilter =
            enhancedArgs.exactQuery?.trim() ||
            (enhancedArgs.queryTerms && enhancedArgs.queryTerms.length > 0) ||
            enhancedArgs.owner ||
            enhancedArgs.language ||
            enhancedArgs.topic ||
            enhancedArgs.stars ||
            enhancedArgs.forks;

          if (!hasPrimaryFilter) {
            return createResult({
              error: `Repository search requires at least one filter. Try:
• Topic search: { topic: "react" }
• Exact search: { exactQuery: "cli shell" }  
• Multiple terms: { queryTerms: ["react", "hooks"] }
• Organization: { owner: "microsoft" }
• Language filter: { language: "go" }

Alternative: Use npm search for package discovery.`,
            });
          }

          // First attempt: Search with current parameters
          const result = await searchGitHubRepos(enhancedArgs);

          if (result.isError) {
            const errorMsg = (result.content?.[0]?.text as string) || '';

            // Smart fallbacks based on error type
            if (errorMsg.includes('rate limit')) {
              return createResult({
                error: `GitHub API rate limit exceeded. Alternatives:
• Use npm search for package discovery
• Remove quality filters (stars/forks)  
• Search fewer organizations
• Wait 5-10 minutes and retry`,
              });
            }

            if (errorMsg.includes('authentication')) {
              return createResult({
                error: `Authentication required:
• Run: gh auth login
• For private repos: use api_status_check tool
• Public repos work without auth

Alternative: Use npm search for packages.`,
              });
            }

            return result; // Return original error for other cases
          }

          // Check if we got results
          const resultData = JSON.parse(result.content[0].text as string);
          const hasResults = resultData.total_count > 0;

          // Smart fallback strategies for no results
          if (!hasResults) {
            const suggestions = [];

            if (enhancedArgs.exactQuery) {
              suggestions.push('• Try broader search terms');
            }

            if (enhancedArgs.language) {
              suggestions.push('• Remove language filter');
            }

            if (enhancedArgs.stars || enhancedArgs.forks) {
              suggestions.push('• Lower quality thresholds');
            }

            if (!enhancedArgs.topic) {
              suggestions.push('• Try topic search: { topic: "react" }');
            }

            if (enhancedArgs.owner) {
              suggestions.push('• Remove owner filter for global search');
            }

            suggestions.push('• Use npm search for package discovery');

            return createResult({
              error: `No repositories found. Try:
${suggestions.join('\n')}`,
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
    )
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

export function buildGitHubReposSearchCommand(
  params: GitHubReposSearchParams
): {
  command: GhCommand;
  args: string[];
} {
  const args = ['repos'];

  let queryForQualifierCheck = '';

  if (params.exactQuery) {
    args.push(`"${params.exactQuery.trim()}"`);
    queryForQualifierCheck = params.exactQuery.trim();
  } else if (params.queryTerms && params.queryTerms.length > 0) {
    // Add each term as separate argument for AND logic
    params.queryTerms.forEach(term => args.push(term.trim()));
    queryForQualifierCheck = params.queryTerms.join(' ');
  }

  const hasEmbeddedQualifiers =
    queryForQualifierCheck &&
    /\b(stars|language|org|repo|topic|user|created|updated|size|license|archived|fork|good-first-issues|help-wanted-issues):/i.test(
      queryForQualifierCheck
    );

  args.push(
    '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility'
  );

  type ParamName = keyof GitHubReposSearchParams;

  // Helper function to clean string values by removing surrounding quotes
  const cleanStringValue = (value: any): string => {
    if (typeof value === 'number') {
      return value.toString();
    }

    let str = value.toString().trim();

    // Remove surrounding quotes if they exist
    if (
      (str.startsWith('"') && str.endsWith('"')) ||
      (str.startsWith("'") && str.endsWith("'"))
    ) {
      str = str.slice(1, -1);
    }

    return str;
  };

  const addArg = (
    paramName: ParamName,
    cliFlag: string,
    condition: boolean = true,
    formatter?: (value: any) => string
  ) => {
    const value = params[paramName];
    if (value !== undefined && condition) {
      if (Array.isArray(value)) {
        // Clean each array element
        const cleanedValues = value.map(v => cleanStringValue(v));
        args.push(`--${cliFlag}=${cleanedValues.join(',')}`);
      } else if (formatter) {
        args.push(`--${cliFlag}=${formatter(value)}`);
      } else {
        args.push(`--${cliFlag}=${cleanStringValue(value)}`);
      }
    }
  };

  // CORE FILTERS
  addArg('owner', 'owner', !hasEmbeddedQualifiers);
  addArg('language', 'language', !hasEmbeddedQualifiers);
  addArg('forks', 'forks', !hasEmbeddedQualifiers, value =>
    cleanStringValue(value)
  );
  addArg('topic', 'topic', !hasEmbeddedQualifiers);
  addArg('number-topics', 'number-topics', true, value =>
    cleanStringValue(value)
  );

  addArg('stars', 'stars', !hasEmbeddedQualifiers, value =>
    cleanStringValue(value)
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
    cleanStringValue(value)
  );
  addArg('help-wanted-issues', 'help-wanted-issues', true, value =>
    cleanStringValue(value)
  );
  addArg('followers', 'followers', true, value => cleanStringValue(value));

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

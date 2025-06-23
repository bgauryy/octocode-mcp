import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult } from '../../utils/responses';
import { GitHubReposSearchParams } from '../../types';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { safeQuote } from '../../utils/query';

const TOOL_NAME = 'github_search_repositories';

const DESCRIPTION = `Search GitHub repositories with powerful filtering. For best results, use specific filters (topic, language, stars) rather than complex boolean queries. Simple OR logic works well, but prefer filter combinations for precise discovery.`;

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

  // Pattern 1: GitHub URLs (https://github.com/owner/repo)
  const githubUrlMatch = query.match(/github\.com\/([^\\s]+)\/([^\\s]+)/i);
  if (githubUrlMatch) {
    extractedOwner = githubUrlMatch[1];
    extractedRepo = githubUrlMatch[2];
    cleanedQuery = query
      .replace(/https?:\/\/github\.com\/[^\\s]+\/[^\\s]+/gi, '')
      .trim();
  }

  // Pattern 2: owner/repo format in query
  const ownerRepoMatch = query.match(
    /\b([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\/([a-zA-Z0-9][a-zA-Z0-9\-.]*[a-zA-Z0-9])\b/
  );
  if (ownerRepoMatch && !extractedOwner) {
    extractedOwner = ownerRepoMatch[1];
    extractedRepo = ownerRepoMatch[2];
    cleanedQuery = query.replace(ownerRepoMatch[0], '').trim();
  }

  // Pattern 3: NPM package-like references (@scope/package)
  const scopedPackageMatch = query.match(
    /@([a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\/([a-zA-Z0-9][a-zA-Z0-9\-.]*[a-zA-Z0-9])/
  );
  if (scopedPackageMatch && !extractedOwner) {
    extractedOwner = scopedPackageMatch[1];
    extractedRepo = scopedPackageMatch[2];
    cleanedQuery = query.replace(scopedPackageMatch[0], '').trim();
  }

  return {
    extractedOwner,
    extractedRepo,
    cleanedQuery: cleanedQuery || query,
  };
}

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
            'Search query with GitHub syntax. Simple terms work best. Can include owner/repo patterns like "microsoft/vscode" or GitHub URLs. For complex searches, prefer using dedicated filter parameters (topic, language, stars) instead of boolean operators for better results.'
          ),

        // CORE FILTERS (GitHub CLI flags)
        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository owner/organization. Use for targeted org search. Can be array for multiple owners.'
          ),
        language: z
          .string()
          .optional()
          .describe(
            'Programming language filter. Highly effective for discovery.'
          ),
        stars: z
          .union([
            z.number().int().min(0),
            z
              .string()
              .regex(
                /^(>=?\d+|<=?\d+|\d+\.\.\d+|\d+)$/,
                'Invalid stars format. Use: number, ">100", ">=50", "<200", "<=100", or "10..100"'
              ),
          ])
          .optional()
          .describe(
            'Stars filter. Number (100) or range (">100", "<50", "10..100", ">=5"). Use >100 for quality projects.'
          ),
        topic: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Topics filter. Single topic or array for semantic discovery. Note: Topics not available in JSON output but filtering works.'
          ),
        forks: z.number().optional().describe('Filter on number of forks.'),

        // UPDATED: Match CLI parameter name exactly
        numberOfTopics: z
          .number()
          .optional()
          .describe(
            'Filter on number of topics (indicates well-documented projects).'
          ),

        // QUALITY & STATE FILTERS
        license: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Filter based on license type (mit, apache-2.0, bsd-3-clause). Can be array.'
          ),
        archived: z
          .boolean()
          .optional()
          .describe(
            'Filter based on the repository archived state (true/false).'
          ),
        includeForks: z
          .enum(['false', 'true', 'only'])
          .optional()
          .describe(
            'Include forks in fetched repositories: false (exclude), true (include), only (forks only).'
          ),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe(
            'Filter based on visibility: public, private, or internal.'
          ),

        // DATE & SIZE FILTERS
        created: z
          .string()
          .optional()
          .describe(
            'Filter based on created at date. Use format: ">2020-01-01", "<2023-12-31".'
          ),
        updated: z
          .string()
          .optional()
          .describe('Filter on last updated at date. Use for active projects.'),
        size: z
          .string()
          .optional()
          .describe(
            'Filter on a size range, in kilobytes. Use format: ">1000", "<500".'
          ),

        // COMMUNITY FILTERS - Match CLI parameter names exactly
        goodFirstIssues: z
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
            'Filter on number of issues with the "good first issue" label. Great for contributors.'
          ),
        helpWantedIssues: z
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
            'Filter on number of issues with the "help wanted" label. Find projects needing help.'
          ),
        followers: z
          .number()
          .optional()
          .describe('Filter based on number of followers.'),

        // SEARCH SCOPE
        match: z
          .enum(['name', 'description', 'readme'])
          .optional()
          .describe(
            'Restrict search to specific field of repository: name, description, or readme.'
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
            'Sort fetched repositories: forks, help-wanted-issues, stars, updated, best-match.'
          ),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe(
            'Order of repositories returned, ignored unless "sort" flag is specified: asc or desc.'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(30)
          .describe('Maximum number of repositories to fetch (default 30).'),
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
        const enhancedArgs = {
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
            error:
              'Requires query or primary filter (owner, language, stars, topic, forks). You can also use owner/repo format like "microsoft/vscode" in the query.',
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
            const privateSearchArgs = {
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
          error:
            'Repository search failed - verify connection or simplify query',
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

      return createResult({
        data: {
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
        },
      });
    } catch (error) {
      return createResult({
        error: 'Repository search failed - verify connection or simplify query',
      });
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
    // Use comprehensive quoting logic for better shell safety
    args.push(safeQuote(query));
  }

  // Add JSON output with specific fields for structured data parsing
  // Note: 'topics' field is not available in GitHub CLI search repos JSON output
  args.push(
    '--json',
    'name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility'
  );

  // CORE FILTERS - Handle arrays properly
  if (params.owner) {
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    owners.forEach(owner => args.push(`--owner=${owner}`));
  }
  if (params.language) args.push(`--language=${params.language}`);
  if (params.forks !== undefined) args.push(`--forks=${params.forks}`);

  // Handle topic as string or array
  if (params.topic) {
    const topics = Array.isArray(params.topic) ? params.topic : [params.topic];
    args.push(`--topic=${topics.join(',')}`);
  }
  if (params.numberOfTopics !== undefined)
    args.push(`--number-topics=${params.numberOfTopics}`);

  // Handle stars as number or string
  if (params.stars !== undefined) {
    const starsValue =
      typeof params.stars === 'number'
        ? params.stars.toString()
        : params.stars.trim();

    // Validate numeric patterns for string values
    if (
      typeof params.stars === 'number' ||
      /^(\d+|>\d+|<\d+|\d+\.\.\d+|>=\d+|<=\d+)$/.test(starsValue)
    ) {
      args.push(`--stars=${starsValue}`);
    }
  }

  // QUALITY & STATE FILTERS
  if (params.archived !== undefined) args.push(`--archived=${params.archived}`);
  if (params.includeForks) args.push(`--include-forks=${params.includeForks}`);
  if (params.visibility) args.push(`--visibility=${params.visibility}`);

  // Handle license as string or array
  if (params.license) {
    const licenses = Array.isArray(params.license)
      ? params.license
      : [params.license];
    args.push(`--license=${licenses.join(',')}`);
  }

  // DATE & SIZE FILTERS
  if (params.created) args.push(`--created=${params.created}`);
  if (params.updated) args.push(`--updated=${params.updated}`);
  if (params.size) args.push(`--size=${params.size}`);

  // COMMUNITY FILTERS - handle both number and string
  if (params.goodFirstIssues) {
    const value =
      typeof params.goodFirstIssues === 'number'
        ? params.goodFirstIssues.toString()
        : params.goodFirstIssues;
    args.push(`--good-first-issues=${value}`);
  }
  if (params.helpWantedIssues) {
    const value =
      typeof params.helpWantedIssues === 'number'
        ? params.helpWantedIssues.toString()
        : params.helpWantedIssues;
    args.push(`--help-wanted-issues=${value}`);
  }
  if (params.followers !== undefined)
    args.push(`--followers=${params.followers}`);

  // SEARCH SCOPE
  if (params.match) args.push(`--match=${params.match}`);

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

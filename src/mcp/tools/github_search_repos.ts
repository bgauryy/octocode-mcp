import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { createResult, toDDMMYYYY } from '../../utils/responses';
import { GitHubReposSearchParams } from '../../types';
import { executeGitHubCommand, GhCommand } from '../../utils/exec';
import { generateCacheKey, withCache } from '../../utils/cache';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

/**
 * GitHub Repository Search Tool
 *
 * MOST EFFECTIVE PATTERNS (based on testing):
 *
 * 1. Quality Discovery:
 *    { topic: ["react", "typescript"], stars: "1000..5000", limit: 10 }
 *
 * 2. Organization Research:
 *    { owner: ["microsoft", "google"], language: "python", limit: 10 }
 *
 * 3. Beginner Projects:
 *    { goodFirstIssues: ">=5", stars: "100..5000", limit: 10 }
 *
 * 4. Recent Quality:
 *    { stars: ">1000", created: ">2023-01-01", limit: 10 }
 *
 * AVOID: OR queries + language filter, 5+ filters, multi-word OR
 * TIP: Use limit parameter instead of adding more filters
 */

const TOOL_NAME = 'github_search_repositories';

const DESCRIPTION = `Search GitHub repositories with powerful GitHub search syntax and advanced filtering.

EMBEDDED QUALIFIERS (MOST POWERFUL):
- "vue OR react stars:>1000 language:javascript" - OR logic with constraints
- "typescript AND framework stars:100..5000" - AND logic with star range  
- "repo:facebook/react OR repo:vuejs/vue" - Multiple specific repositories
- "org:microsoft OR org:google language:typescript" - Multiple organizations
- "topic:react topic:typescript stars:>500" - Multiple topics with quality filter

TRADITIONAL FILTERS (ALSO SUPPORTED):
- owner: ["microsoft", "google"] - Multiple owners as array
- topic: ["react", "typescript"] - Multiple topics as array
- stars: "1000..5000" - Range or threshold filtering

BEST PRACTICES:
- Use embedded qualifiers for complex queries with OR/AND logic
- Use traditional filters for simple, clean parameter-based searches
- Combine both approaches: "vue OR react" + language:"javascript" + stars:">1000"`;

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
            'Search query with GitHub search syntax. POWERFUL EXAMPLES: "vue OR react stars:>1000", "typescript AND framework stars:100..5000", "repo:facebook/react OR repo:vuejs/vue", "org:microsoft language:typescript", "topic:react topic:typescript stars:>500". SUPPORTS: OR/AND logic, embedded qualifiers (stars:, language:, org:, repo:, topic:, etc.), exact repository targeting. COMBINES with traditional filters for maximum flexibility.'
          ),

        // CORE FILTERS (GitHub CLI flags)
        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Repository owner/organization. HIGHLY EFFECTIVE as array ["microsoft", "google"]. FIXED: Now supports multiple owners with comma separation. Best for targeted research.'
          ),
        language: z
          .string()
          .optional()
          .describe(
            'Programming language filter. CAUTION: Restrictive with other filters. Use alone or with stars/owner only.'
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
            'Stars filter. MOST EFFECTIVE: ranges "1000..5000", thresholds ">1000". Excellent for quality filtering.'
          ),
        topic: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Topics filter. BEST PATTERN: arrays ["react", "typescript"]. FIXED: Now supports comma-separated topics. Preferred over OR queries. Combines well with stars.'
          ),
        forks: z.number().optional().describe('Number of forks filter.'),

        // UPDATED: Match CLI parameter name exactly
        numberOfTopics: z
          .number()
          .optional()
          .describe(
            'Filter by number of topics (indicates documentation quality).'
          ),

        // QUALITY & STATE FILTERS
        license: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'License filter. Works well as array ["mit", "apache-2.0"].'
          ),
        archived: z
          .boolean()
          .optional()
          .describe('Filter archived repositories (true/false).'),
        includeForks: z
          .enum(['false', 'true', 'only'])
          .optional()
          .describe(
            'Include forks: false (exclude), true (include), only (forks only).'
          ),
        visibility: z
          .enum(['public', 'private', 'internal'])
          .optional()
          .describe('Repository visibility filter.'),

        // DATE & SIZE FILTERS
        created: z
          .string()
          .optional()
          .describe(
            'Created date filter. Format: ">2020-01-01", "<2023-12-31".'
          ),
        updated: z
          .string()
          .optional()
          .describe('Updated date filter. Good for finding active projects.'),
        size: z
          .string()
          .optional()
          .describe('Repository size filter in KB. Format: ">1000", "<500".'),

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
            'Good first issues count. WORKING: Filter for beginner-friendly projects. EXCELLENT when combined with stars "100..5000" for quality beginner projects.'
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
            'Help wanted issues count. Good for finding projects needing contributors.'
          ),
        followers: z.number().optional().describe('Followers count filter.'),

        // SEARCH SCOPE
        match: z
          .enum(['name', 'description', 'readme'])
          .optional()
          .describe('Search scope: name, description, or readme content.'),

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
            'Sort by: stars, updated, forks, help-wanted-issues, best-match.'
          ),
        order: z
          .enum(['asc', 'desc'])
          .optional()
          .default('desc')
          .describe('Sort order: asc or desc.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(30)
          .describe(
            'Results limit (1-100). PREFER increasing limit over adding filters.'
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
      const repositories = execResult.result;
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
          createdAt: toDDMMYYYY(repo.createdAt),
          updatedAt: toDDMMYYYY(repo.updatedAt),
          visibility: repo.visibility || 'public',
          owner: repo.owner?.login || repo.owner,
        }));
      }

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
                cli_command: execResult.command, // Only on no results
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

  // Detect embedded qualifiers in query to avoid conflicts and optimize
  const hasEmbeddedQualifiers =
    query &&
    /\b(stars|language|org|repo|topic|user|created|updated|size|license|archived|fork|good-first-issues|help-wanted-issues):/i.test(
      query
    );

  // Handle exact string search - preserve quotes and special characters
  if (query) {
    // For exact repository name searches (quoted strings), preserve the quotes
    // For special characters, pass them through - GitHub CLI handles escaping
    // Support searches like "microsoft/vscode", "@types/node", etc.
    args.push(query);
  }

  // Add JSON output with specific fields for structured data parsing
  // Note: 'topics' field is not available in GitHub CLI search repos JSON output
  args.push(
    '--json=name,fullName,description,language,stargazersCount,forksCount,updatedAt,createdAt,url,owner,isPrivate,license,hasIssues,openIssuesCount,isArchived,isFork,visibility'
  );

  // SMART FILTER HANDLING - Avoid conflicts with embedded qualifiers
  // Only add CLI flags if not already specified in query to prevent conflicts

  // CORE FILTERS - Handle arrays properly
  if (params.owner && !hasEmbeddedQualifiers) {
    // GitHub CLI supports multiple owners with comma separation: --owner=owner1,owner2
    const owners = Array.isArray(params.owner) ? params.owner : [params.owner];
    args.push(`--owner=${owners.join(',')}`);
  }
  if (params.language && !hasEmbeddedQualifiers)
    args.push(`--language=${params.language}`);
  if (params.forks !== undefined && !hasEmbeddedQualifiers)
    args.push(`--forks=${params.forks}`);

  // Handle topic as string or array - GitHub CLI expects comma-separated topics
  if (params.topic && !hasEmbeddedQualifiers) {
    const topics = Array.isArray(params.topic) ? params.topic : [params.topic];
    args.push(`--topic=${topics.join(',')}`);
  }
  if (params.numberOfTopics !== undefined)
    args.push(`--number-topics=${params.numberOfTopics}`);

  // Handle stars as number or string - avoid conflicts with embedded qualifiers
  if (params.stars !== undefined && !hasEmbeddedQualifiers) {
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

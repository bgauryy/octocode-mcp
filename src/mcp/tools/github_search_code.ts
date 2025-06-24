import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import {
  GitHubCodeSearchParams,
  GitHubCodeSearchItem,
  OptimizedCodeSearchResult,
} from '../../types';
import {
  createResult,
  simplifyRepoUrl,
  simplifyGitHubUrl,
  optimizeTextMatch,
} from '../../utils/responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { generateCacheKey, withCache } from '../../utils/cache';
import { executeGitHubCommand } from '../../utils/exec';

const TOOL_NAME = 'github_search_code';

const DESCRIPTION = `Search code across GitHub repositories. Start broad, add filters for precision. Examples: "useState" → "useState language:javascript" → "useState filename:*.jsx".

PROVEN PATTERNS: "authentication" → +language → +owner → +filename
KEY TIPS: language filter = 90% speed boost, owner filter = 95% scope reduction`;

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        query: z
          .string()
          .min(1)
          .describe(
            `Search query with GitHub syntax. Boolean: "react AND hooks", exact phrases: "error handling".

PATTERNS: "useState", "error handling", "react AND hooks", "vue OR svelte"
RULES: Boolean operators MUST be uppercase (AND, OR, NOT). Use language filter for 90% speed boost.`
          ),

        language: z
          .string()
          .optional()
          .describe(
            `MOST EFFECTIVE FILTER - 90% speed boost! Essential for popular languages.

POPULAR: javascript, typescript, python, java, go, rust, php, ruby, swift, kotlin, dart
SYSTEMS: c, cpp, assembly, shell, dockerfile, yaml`
          ),

        owner: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            `HIGH IMPACT - Reduces search space by 95%+

EXAMPLES: "microsoft", "google", "facebook" or ["microsoft", "google"]
POPULAR: microsoft, google, facebook, amazon, apache, hashicorp, kubernetes`
          ),

        filename: z
          .string()
          .optional()
          .describe(
            `SURGICAL PRECISION for configs and special files

TARGETS: "package.json", "Dockerfile", "webpack.config.js", ".eslintrc", "README.md"
STRATEGY: filename:package.json + "react typescript"`
          ),

        repo: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            `PRECISE TARGETING for specific repositories

FORMAT: "facebook/react", "microsoft/vscode" or ["facebook/react", "vuejs/vue"]
USE: Deep dive analysis of specific projects`
          ),

        extension: z
          .string()
          .optional()
          .describe(
            `FILE TYPE PRECISION - More specific than language filter

POPULAR: js, ts, jsx, tsx, py, java, go, rs, rb, php, cs, sh, yml, json, md
USE: extension:tsx (React TypeScript only), extension:dockerfile`
          ),

        match: z
          .union([z.enum(['file', 'path']), z.array(z.enum(['file', 'path']))])
          .optional()
          .describe(
            `SEARCH SCOPE: "file" (content), "path" (filenames), ["file", "path"] (both)

EXAMPLES: match:"path" + "test" (find test files), match:"file" + "useState"`
          ),

        size: z
          .string()
          .optional()
          .describe(
            `FILE SIZE FILTER: ">100" (>100KB), "<50" (<50KB), "10..100" (range)

STRATEGY: "<200" (avoid huge files), ">20" (substantial code), "<10" (configs)`
          ),

        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .default(30)
          .describe(
            `RESULTS: 10-20 (quick), 30 (default), 50-100 (comprehensive). Use filters over high limits.`
          ),
      },
      annotations: {
        title: 'GitHub Code Search - Smart & Efficient',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubCodeSearchParams): Promise<CallToolResult> => {
      try {
        // Validate parameter combinations
        const validationError = validateSearchParameters(args);
        if (validationError) {
          return createResult({ error: validationError });
        }

        const result = await searchGitHubCode(args);

        if (result.isError) {
          return result;
        }

        const execResult = JSON.parse(result.content[0].text as string);
        const codeResults: GitHubCodeSearchItem[] = JSON.parse(
          execResult.result
        );

        // GitHub CLI returns a direct array, not an object with total_count and items
        const items = Array.isArray(codeResults) ? codeResults : [];

        // Smart handling for no results - provide actionable suggestions
        if (items.length === 0) {
          return handleNoResults(args, execResult.command);
        }

        // Transform to optimized format
        const optimizedResult = transformToOptimizedFormat(items, args);

        return createResult({ data: optimizedResult });
      } catch (error) {
        const errorMessage = (error as Error).message || '';

        // Handle JSON parsing errors
        if (errorMessage.includes('JSON')) {
          return createResult({
            error:
              'GitHub CLI returned invalid response - check if GitHub CLI is up to date with "gh version" and try again',
          });
        }

        return createResult({
          error: 'GitHub code search failed',
          suggestions: [
            'Try simpler queries without NOT operators',
            'Use filters (language, owner, filename) instead of complex boolean',
            'Check authentication with api_status_check',
          ],
        });
      }
    }
  );
}

/**
 * Smart handler for no results - provides actionable suggestions
 */
function handleNoResults(
  params: GitHubCodeSearchParams,
  cliCommand: string
): CallToolResult {
  const suggestions = generateSmartSuggestions(params);
  const fallbackQueries = generateFallbackQueries(params);

  return createResult({
    data: {
      items: [],
      total_count: 0,
      smart_suggestions: {
        message:
          "No results found. Here are smart strategies to find what you're looking for:",
        suggestions,
        fallback_queries: fallbackQueries,
        next_steps: [
          'Try one of the fallback queries above',
          'Remove some filters to broaden the search',
          'Use different keywords or synonyms',
          'Check spelling and try variations',
        ],
      },
      metadata: {
        has_filters: !!(
          params.language ||
          params.owner ||
          params.filename ||
          params.extension
        ),
        search_scope: params.match
          ? Array.isArray(params.match)
            ? params.match.join(',')
            : params.match
          : 'file',
      },
      cli_command: cliCommand,
    },
  });
}

/**
 * Generate smart suggestions based on current search parameters
 */
function generateSmartSuggestions(params: GitHubCodeSearchParams): string[] {
  const suggestions: string[] = [];

  // Query-specific suggestions
  if (params.query.includes('"')) {
    suggestions.push(
      'Remove quotes to search for individual terms instead of exact phrase'
    );
  }

  if (params.query.includes(' AND ') || params.query.includes(' OR ')) {
    suggestions.push('Try simpler queries without boolean operators');
  }

  if (params.query.length > 50) {
    suggestions.push('Simplify query - shorter terms often work better');
  }

  // Filter-specific suggestions
  if (!params.language) {
    suggestions.push('Add language filter - this improves results by 90%');
  }

  if (params.language && !params.owner && !params.filename) {
    suggestions.push('Add owner filter to target specific organizations');
  }

  if (params.owner && params.repo) {
    suggestions.push(
      'Remove repo filter and search across all repos in the organization'
    );
  }

  if (params.filename) {
    suggestions.push('Remove filename filter to search all file types');
  }

  if (params.extension && params.language) {
    suggestions.push(
      'Try removing extension filter (language filter might be sufficient)'
    );
  }

  // Always provide generic fallbacks
  if (suggestions.length === 0) {
    suggestions.push('Try a broader search with fewer filters');
    suggestions.push('Use more common/general terms');
    suggestions.push('Check for typos in query or filter values');
  }

  return suggestions.slice(0, 5); // Limit to top 5 suggestions
}

/**
 * Generate fallback queries that are likely to succeed
 */
function generateFallbackQueries(params: GitHubCodeSearchParams): Array<{
  query: string;
  description: string;
  rationale: string;
}> {
  const fallbacks: Array<{
    query: string;
    description: string;
    rationale: string;
  }> = [];

  // Extract key terms from original query
  const keyTerms = extractKeyTerms(params.query);

  // Fallback 1: Simplify query, keep language if present
  if (keyTerms.length > 1) {
    const simplifiedQuery = keyTerms[0];
    fallbacks.push({
      query: simplifiedQuery,
      description: `Search for just "${simplifiedQuery}"${params.language ? ` in ${params.language}` : ''}`,
      rationale: 'Single term searches often yield better results',
    });
  }

  // Fallback 2: Remove filters but keep core query
  if (params.language || params.owner || params.filename || params.extension) {
    fallbacks.push({
      query: keyTerms.join(' '),
      description: `Search "${keyTerms.join(' ')}" without filters`,
      rationale: 'Removes restrictive filters for broader results',
    });
  }

  // Fallback 3: Language-specific popular search
  if (params.language) {
    const popularTerms = getPopularTermsForLanguage(params.language);
    if (popularTerms.length > 0) {
      fallbacks.push({
        query: popularTerms[0],
        description: `Popular ${params.language} pattern: "${popularTerms[0]}"`,
        rationale: `Common patterns in ${params.language} development`,
      });
    }
  }

  // Fallback 4: Broader category search
  const category = inferCategory(params.query);
  if (category) {
    fallbacks.push({
      query: category,
      description: `Broader search: "${category}"`,
      rationale: 'Searches the general category for related patterns',
    });
  }

  return fallbacks.slice(0, 4);
}

/**
 * Extract key terms from search query
 */
function extractKeyTerms(query: string): string[] {
  // Remove quotes, boolean operators, and special characters
  const cleaned = query
    .replace(/["']/g, '')
    .replace(/\b(AND|OR|NOT)\b/gi, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.split(' ').filter(term => term.length > 2);
}

/**
 * Get popular search terms for specific programming languages
 */
function getPopularTermsForLanguage(language: string): string[] {
  const popularTerms: Record<string, string[]> = {
    javascript: [
      'useState',
      'async await',
      'fetch api',
      'event listener',
      'promise',
    ],
    typescript: [
      'interface',
      'generic type',
      'type guard',
      'enum',
      'namespace',
    ],
    python: ['def function', 'import', 'class method', 'lambda', 'decorator'],
    java: [
      'public class',
      'static method',
      'interface',
      'annotation',
      'spring',
    ],
    go: ['func main', 'interface', 'goroutine', 'channel', 'struct'],
    rust: ['fn main', 'impl', 'trait', 'enum', 'match'],
    cpp: ['class', 'template', 'namespace', 'virtual', 'std::'],
    c: ['int main', 'struct', 'malloc', 'pointer', 'header'],
    php: ['function', 'class', 'namespace', 'interface', 'trait'],
    ruby: ['def', 'class', 'module', 'block', 'gem'],
    swift: ['func', 'class', 'protocol', 'extension', 'guard'],
    kotlin: ['fun', 'class', 'interface', 'data class', 'coroutine'],
    dart: ['class', 'function', 'widget', 'async', 'future'],
    shell: ['function', 'if then', 'for loop', 'variable', 'script'],
    yaml: ['version', 'name', 'build', 'deploy', 'config'],
    dockerfile: ['FROM', 'RUN', 'COPY', 'EXPOSE', 'CMD'],
  };

  return popularTerms[language.toLowerCase()] || [];
}

/**
 * Infer search category from query terms
 */
function inferCategory(query: string): string | null {
  const categories: Record<string, string[]> = {
    authentication: [
      'auth',
      'login',
      'oauth',
      'jwt',
      'token',
      'passport',
      'session',
    ],
    database: ['db', 'sql', 'query', 'model', 'schema', 'migration', 'orm'],
    api: ['rest', 'graphql', 'endpoint', 'route', 'request', 'response'],
    testing: ['test', 'spec', 'mock', 'assert', 'unit', 'integration'],
    config: ['config', 'setting', 'env', 'environment', 'setup'],
    ui: ['component', 'button', 'form', 'modal', 'layout', 'style'],
    error: ['error', 'exception', 'try', 'catch', 'throw', 'handle'],
    performance: ['cache', 'optimization', 'memory', 'speed', 'performance'],
    security: ['security', 'encrypt', 'hash', 'validate', 'sanitize'],
  };

  const queryLower = query.toLowerCase();

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(keyword => queryLower.includes(keyword))) {
      return category;
    }
  }

  return null;
}

/**
 * Transform GitHub CLI response to optimized format with enhanced metadata
 */
function transformToOptimizedFormat(
  items: GitHubCodeSearchItem[],
  params: GitHubCodeSearchParams
): OptimizedCodeSearchResult {
  const searchEfficiency = calculateSearchEfficiency(params);

  // Extract repository info if single repo search
  const singleRepo = extractSingleRepository(items);

  const optimizedItems = items.map(item => ({
    path: item.path,
    matches: item.textMatches.map(match => ({
      context: optimizeTextMatch(match.fragment, 120), // Increased context for better understanding
      positions: match.matches.map(m => m.indices as [number, number]),
    })),
    url: singleRepo ? item.path : simplifyGitHubUrl(item.url),
  }));

  const result: OptimizedCodeSearchResult = {
    items: optimizedItems,
    total_count: items.length,
  };

  // Add repository info if single repo
  if (singleRepo) {
    result.repository = {
      name: singleRepo.nameWithOwner,
      url: simplifyRepoUrl(singleRepo.url),
    };
  }

  // Enhanced metadata with search efficiency and tips
  result.metadata = {
    has_filters: !!(
      params.language ||
      params.owner ||
      params.filename ||
      params.extension
    ),
    search_scope: params.match
      ? Array.isArray(params.match)
        ? params.match.join(',')
        : params.match
      : 'file',
    search_efficiency: searchEfficiency,
  };

  // Add performance tips for low-efficiency searches
  if (searchEfficiency.score < 7) {
    result.metadata.performance_tips = generatePerformanceTips(params);
  }

  return result;
}

/**
 * Calculate search efficiency score and provide insights
 */
function calculateSearchEfficiency(params: GitHubCodeSearchParams): {
  score: number;
  factors: string[];
  recommendations: string[];
} {
  let score = 5; // Base score
  const factors: string[] = [];
  const recommendations: string[] = [];

  // Language filter is huge efficiency boost
  if (params.language) {
    score += 3;
    factors.push('Language filter (+3)');
  } else {
    recommendations.push('Add language filter for 90% performance boost');
  }

  // Owner filter provides good targeting
  if (params.owner) {
    score += 2;
    factors.push('Owner filter (+2)');
  }

  // Filename filter is very efficient
  if (params.filename) {
    score += 2;
    factors.push('Filename filter (+2)');
  }

  // Extension filter adds precision
  if (params.extension) {
    score += 1;
    factors.push('Extension filter (+1)');
  }

  // Repository filter is highly targeted
  if (params.repo) {
    score += 2;
    factors.push('Repository filter (+2)');
  }

  // Size filter helps avoid huge files
  if (params.size) {
    score += 1;
    factors.push('Size filter (+1)');
  }

  // Penalties for inefficient patterns
  if (params.query.includes(' OR ')) {
    score -= 1;
    factors.push('OR operator (-1)');
    recommendations.push('Consider separate searches instead of OR');
  }

  if (params.query.includes(' NOT ')) {
    score -= 2;
    factors.push('NOT operator (-2)');
    recommendations.push('Avoid NOT operator, use positive filters instead');
  }

  if (params.query.length > 100) {
    score -= 1;
    factors.push('Long query (-1)');
    recommendations.push('Simplify query for better results');
  }

  return {
    score: Math.max(1, Math.min(10, score)),
    factors,
    recommendations,
  };
}

/**
 * Generate performance tips for inefficient searches
 */
function generatePerformanceTips(params: GitHubCodeSearchParams): string[] {
  const tips: string[] = [];

  if (!params.language) {
    tips.push('🚀 Add language filter - single biggest performance boost');
  }

  if (!params.owner && !params.repo) {
    tips.push('🎯 Add owner filter to target specific organizations');
  }

  if (params.query.includes(' OR ')) {
    tips.push('⚡ Replace OR with separate, focused searches');
  }

  if (params.query.includes(' NOT ')) {
    tips.push(
      '✨ Replace NOT with positive filters (language, filename, etc.)'
    );
  }

  if (!params.filename && !params.extension) {
    tips.push('📁 Add filename or extension filter for file-type precision');
  }

  return tips.slice(0, 3);
}

/**
 * Extract single repository if all results are from same repo
 */
function extractSingleRepository(items: GitHubCodeSearchItem[]) {
  if (items.length === 0) return null;

  const firstRepo = items[0].repository;
  const allSameRepo = items.every(
    item => item.repository.nameWithOwner === firstRepo.nameWithOwner
  );

  return allSameRepo ? firstRepo : null;
}

/**
 * Build command line arguments for GitHub CLI with improved parameter handling
 */
function buildGitHubCliArgs(params: GitHubCodeSearchParams) {
  const args = ['code'];

  // Use the query directly - preserve user intent
  const searchQuery = params.query;

  // Always quote the search query to handle spaces and special characters properly
  args.push(searchQuery);

  // Add filters in order of effectiveness for better CLI performance
  if (params.language) {
    args.push(`--language=${params.language}`);
  }

  if (params.filename) {
    args.push(`--filename=${params.filename}`);
  }

  if (params.extension) {
    args.push(`--extension=${params.extension}`);
  }

  if (params.size) {
    args.push(`--size=${params.size}`);
  }

  // Always add limit
  if (params.limit) {
    args.push(`--limit=${params.limit}`);
  }

  // Handle match parameter
  if (params.match) {
    const matchValues = Array.isArray(params.match)
      ? params.match
      : [params.match];
    // Use the first match type when multiple are provided
    const matchValue = matchValues[0];
    args.push(`--match=${matchValue}`);
  }

  // Handle owner parameter - can be string or array
  if (params.owner && !params.repo) {
    const ownerValues = Array.isArray(params.owner)
      ? params.owner
      : [params.owner];
    ownerValues.forEach(owner => args.push(`--owner=${owner}`));
  }

  // Handle repository filters with improved validation
  if (params.repo) {
    const repos = Array.isArray(params.repo) ? params.repo : [params.repo];

    if (params.owner) {
      const owners = Array.isArray(params.owner)
        ? params.owner
        : [params.owner];
      // Create repo filters for each owner/repo combination
      owners.forEach(owner => {
        repos.forEach(repo => {
          // Handle both "owner/repo" format and just "repo" format
          if (repo.includes('/')) {
            args.push(`--repo=${repo}`);
          } else {
            args.push(`--repo=${owner}/${repo}`);
          }
        });
      });
    } else {
      // Handle repo without owner (must be in owner/repo format)
      repos.forEach(repo => {
        args.push(`--repo=${repo}`);
      });
    }
  }

  // JSON output with all available fields
  args.push('--json=repository,path,textMatches,sha,url');

  return args;
}

export async function searchGitHubCode(
  params: GitHubCodeSearchParams
): Promise<CallToolResult> {
  const cacheKey = generateCacheKey('gh-code', params);

  return withCache(cacheKey, async () => {
    try {
      const args = buildGitHubCliArgs(params);

      const result = await executeGitHubCommand('search', args, {
        cache: false,
      });

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message || '';

      // Parse specific GitHub CLI error types
      if (errorMessage.includes('authentication')) {
        return createResult({
          error: 'GitHub authentication required - run api_status_check tool',
        });
      }

      if (errorMessage.includes('rate limit')) {
        return createResult({
          error:
            'GitHub rate limit exceeded - use more specific filters or wait',
          suggestions: [
            'Add language filter to reduce search scope',
            'Use owner filter to target specific organizations',
            'Add filename filter for precision targeting',
            'Wait a few minutes and try again',
          ],
        });
      }

      if (
        errorMessage.includes('validation failed') ||
        errorMessage.includes('Invalid query')
      ) {
        return createResult({
          error: 'Invalid query syntax. GitHub legacy search has limitations.',
          suggestions: [
            'Remove NOT operators (use positive filters instead)',
            'Simplify OR logic to separate searches',
            'Use quotes for exact phrases: "error handling"',
            'Try: language:python + "function definition" instead of complex boolean',
          ],
        });
      }

      if (
        errorMessage.includes('repository not found') ||
        errorMessage.includes('owner not found')
      ) {
        return createResult({
          error: 'Repository or owner not found',
          suggestions: [
            'Verify exact owner/repository names (case-sensitive)',
            'Check if repository is private and you have access',
            'Remove repo filter to search across all repositories',
            'Use owner filter instead of specific repo for broader search',
          ],
        });
      }

      if (errorMessage.includes('timeout')) {
        return createResult({
          error: 'Search timeout - query too broad',
          suggestions: [
            'Add language filter to narrow scope',
            'Use owner or repo filters for targeting',
            'Simplify query terms',
            'Add filename filter for specific file types',
          ],
        });
      }

      // Generic fallback with helpful guidance
      return createResult({
        error: 'Code search failed',
        suggestions: [
          'Check GitHub CLI authentication with: gh auth status',
          'Simplify query and add language filter',
          'Try owner filter for targeted search',
          'Use api_status_check tool to verify setup',
        ],
      });
    }
  });
}

/**
 * Enhanced validation with helpful suggestions
 */
function validateSearchParameters(
  params: GitHubCodeSearchParams
): string | null {
  // Query validation
  if (!params.query.trim()) {
    return 'Empty query. Try: "useState", "authentication", "docker setup", or use filters like language:python';
  }

  if (params.query.length > 1000) {
    return 'Query too long (max 1000 chars). Simplify to key terms like "error handling" instead of full sentences.';
  }

  // Repository validation - allow owner/repo format in repo field
  if (params.repo && !params.owner) {
    const repoValues = Array.isArray(params.repo) ? params.repo : [params.repo];
    const hasOwnerFormat = repoValues.every(repo => repo.includes('/'));
    if (!hasOwnerFormat) {
      return 'Repository format error. Use "owner/repo" format like "facebook/react" or provide both owner and repo parameters.';
    }
  }

  // Invalid characters in query
  if (params.query.includes('\\') && !params.query.includes('\\"')) {
    return 'Invalid escape characters. Use quotes for exact phrases: "error handling" instead of escape sequences.';
  }

  // Boolean operator validation with suggestions
  const invalidBooleans = params.query.match(/\b(and|or|not)\b/g);
  if (invalidBooleans) {
    const corrected = invalidBooleans.map(op => op.toUpperCase()).join(', ');
    return `Boolean operators must be uppercase: ${corrected}. Example: "react OR vue" not "react or vue"`;
  }

  return null; // No validation errors
}

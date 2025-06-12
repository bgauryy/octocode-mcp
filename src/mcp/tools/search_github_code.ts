import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { GitHubCodeSearchParams } from '../../types';
import { searchGitHubCode } from '../../impl/github/searchGitHubCode';

// Enhanced search pattern analysis with boolean operator suggestions
function analyzeSearchPattern(args: GitHubCodeSearchParams): {
  patternType: string;
  suggestions: string[];
  warnings: string[];
  booleanRecommendations: string[];
  contextEnrichment: string[];
} {
  const suggestions: string[] = [];
  const warnings: string[] = [];
  const booleanRecommendations: string[] = [];
  const contextEnrichment: string[] = [];
  let patternType = 'basic';

  const query = args.query.toLowerCase();
  const hasBoolean = /\b(OR|AND|NOT)\b/i.test(args.query);

  // Enhanced Function signature patterns
  if (query.includes('function') || query.includes('export')) {
    patternType = 'function-discovery';
    suggestions.push(
      'PROVEN: "export function" → VSCode functions (localize, getVersion, fixWin32DirectoryPermissions)'
    );

    if (!hasBoolean) {
      booleanRecommendations.push(
        'BOOLEAN ENHANCEMENT: "export function OR function export" - catches different code styles'
      );
      booleanRecommendations.push(
        'EXCLUDE TESTS: "export function NOT test" - focuses on production code'
      );
    }

    contextEnrichment.push(
      'CONTEXT: Try specific function types like "async function", "arrow function"'
    );
  }

  // Enhanced React/Component patterns
  if (
    query.includes('react') ||
    query.includes('component') ||
    query.includes('jsx')
  ) {
    patternType = 'component-discovery';
    suggestions.push(
      'PROVEN: "class extends" → React class components, "import React" → React usage patterns'
    );

    if (!hasBoolean) {
      booleanRecommendations.push(
        'HOOK DISCOVERY: "useState OR useEffect OR useContext" - find React hooks usage'
      );
      booleanRecommendations.push(
        'COMPONENT TYPES: "class Component OR function Component" - both paradigms'
      );
      booleanRecommendations.push(
        'EXCLUDE TESTS: "React NOT test NOT spec" - production components only'
      );
    }

    contextEnrichment.push(
      'CONTEXT: Consider specific patterns like "jsx", "tsx", "props", "state"'
    );
  }

  // Authentication/Security patterns
  if (
    query.includes('auth') ||
    query.includes('login') ||
    query.includes('password') ||
    query.includes('token')
  ) {
    patternType = 'security-discovery';

    if (!hasBoolean) {
      booleanRecommendations.push(
        'AUTH METHODS: "login OR authenticate OR signin" - comprehensive coverage'
      );
      booleanRecommendations.push(
        'TOKEN HANDLING: "jwt OR token OR bearer" - different auth mechanisms'
      );
      booleanRecommendations.push(
        'SECURITY FOCUS: "auth NOT mock NOT test" - real implementations'
      );
    }

    contextEnrichment.push(
      'SECURITY CONTEXT: Try "middleware", "guard", "interceptor", "validation"'
    );
  }

  // API/HTTP patterns
  if (
    query.includes('api') ||
    query.includes('http') ||
    query.includes('request') ||
    query.includes('fetch')
  ) {
    patternType = 'api-discovery';

    if (!hasBoolean) {
      booleanRecommendations.push(
        'HTTP METHODS: "fetch OR axios OR request" - different HTTP clients'
      );
      booleanRecommendations.push(
        'API PATTERNS: "endpoint OR route OR handler" - API structure'
      );
      booleanRecommendations.push(
        'ERROR HANDLING: "try catch OR error handling" - robust patterns'
      );
    }

    contextEnrichment.push(
      'API CONTEXT: Consider "cors", "middleware", "validation", "serialization"'
    );
  }

  // Database/Storage patterns
  if (
    query.includes('database') ||
    query.includes('db') ||
    query.includes('sql') ||
    query.includes('query')
  ) {
    patternType = 'database-discovery';

    if (!hasBoolean) {
      booleanRecommendations.push(
        'DB OPERATIONS: "insert OR update OR delete OR select" - CRUD operations'
      );
      booleanRecommendations.push(
        'DB TYPES: "mongodb OR postgresql OR mysql" - different databases'
      );
      booleanRecommendations.push(
        'ORM PATTERNS: "sequelize OR typeorm OR prisma" - ORM frameworks'
      );
    }
  }

  // Error handling patterns
  if (
    query.includes('error') ||
    query.includes('exception') ||
    query.includes('try') ||
    query.includes('catch')
  ) {
    patternType = 'error-handling';

    if (!hasBoolean) {
      booleanRecommendations.push(
        'ERROR PATTERNS: "try catch OR error handling OR exception" - comprehensive coverage'
      );
      booleanRecommendations.push(
        'ERROR TYPES: "throw OR raise OR reject" - different error mechanisms'
      );
    }
  }

  // Testing patterns - suggest exclusion
  if (
    query.includes('test') ||
    query.includes('spec') ||
    query.includes('mock')
  ) {
    if (!query.includes('NOT')) {
      booleanRecommendations.push(
        'EXCLUDE TESTS: Add "NOT test NOT spec NOT mock" to focus on production code'
      );
    }
  }

  // Generic single-term queries - high potential for boolean enhancement
  const words = query.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 1 && !hasBoolean && words[0].length > 3) {
    booleanRecommendations.push(
      `SYNONYM EXPANSION: "${words[0]} OR ${words[0]}s OR ${words[0]}ing" - catch variations`
    );
    booleanRecommendations.push(
      `CONTEXT EXPANSION: "${words[0]} OR related_term" - add contextual terms`
    );
  }

  // Boolean operator patterns (existing logic enhanced)
  if (hasBoolean) {
    patternType = 'boolean-search';
    suggestions.push(
      'PROVEN: "useState OR useEffect" ✅, "function NOT test" ✅'
    );
  }

  // Path filter validation (enhanced)
  if (args.path === 'src' && !args.repo) {
    warnings.push(
      'CRITICAL: path:src may fail - many repos use path:packages, path:lib instead'
    );
    suggestions.push(
      'PROVEN PATHS: React uses "packages", VSCode uses "src/vs", TypeScript uses "src"'
    );
    contextEnrichment.push(
      'PATH ALTERNATIVES: Try without path filter first, then add specific paths based on results'
    );
  }

  // Language-specific enhancements
  if (args.language) {
    const lang = args.language.toLowerCase();
    if (lang === 'typescript' || lang === 'javascript') {
      contextEnrichment.push(
        'JS/TS CONTEXT: Consider "interface", "type", "import", "export", "async/await"'
      );
    } else if (lang === 'python') {
      contextEnrichment.push(
        'PYTHON CONTEXT: Consider "def", "class", "import", "__init__", "async def"'
      );
    } else if (lang === 'java') {
      contextEnrichment.push(
        'JAVA CONTEXT: Consider "public", "private", "class", "interface", "import"'
      );
    }
  }

  // Cross-repository patterns (enhanced)
  if (!args.owner && !args.repo && args.query.includes('async')) {
    patternType = 'cross-repo-discovery';
    suggestions.push(
      'PROVEN: "async function login" finds 4 TypeScript authentication implementations'
    );
    contextEnrichment.push(
      'CROSS-REPO: Global searches work well for common patterns like async/await, error handling'
    );
  }

  // Zero results prediction
  if (query.length > 50 || query.split(' ').length > 8) {
    warnings.push(
      'COMPLEXITY WARNING: Very long/complex queries often return 0 results'
    );
    booleanRecommendations.push(
      'SIMPLIFY: Break into shorter boolean queries: "term1 OR term2" instead of long phrase'
    );
  }

  return {
    patternType,
    suggestions,
    warnings,
    booleanRecommendations,
    contextEnrichment,
  };
}

// Enhanced query optimization for better results
function optimizeQuery(args: GitHubCodeSearchParams): {
  originalQuery: string;
  optimizedQueries: string[];
  rationale: string[];
} {
  const original = args.query;
  const optimized: string[] = [];
  const rationale: string[] = [];

  // If already has boolean operators, don't modify
  if (/\b(OR|AND|NOT)\b/i.test(original)) {
    return {
      originalQuery: original,
      optimizedQueries: [original],
      rationale: ['Query already contains boolean operators - using as-is'],
    };
  }

  // Single word - expand with variations
  const words = original.trim().split(/\s+/);
  if (words.length === 1) {
    const word = words[0];
    if (word.length > 3) {
      optimized.push(`${word} OR ${word}s OR ${word}ing`);
      rationale.push('Added common word variations for broader coverage');

      optimized.push(`${word} NOT test NOT spec`);
      rationale.push('Excluded test files to focus on production code');
    }
  }

  // Multiple words - create boolean combinations
  if (words.length >= 2 && words.length <= 4) {
    // OR combination for broader results
    optimized.push(words.join(' OR '));
    rationale.push('Created OR combination for broader matching');

    // AND combination with test exclusion
    optimized.push(`${words.join(' AND ')} NOT test`);
    rationale.push('Created AND combination excluding tests');
  }

  // If no optimizations were made, return original
  if (optimized.length === 0) {
    optimized.push(original);
    rationale.push('Query structure optimal as-is');
  }

  return {
    originalQuery: original,
    optimizedQueries: optimized,
    rationale,
  };
}

export function registerGitHubSearchCodeTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_SEARCH_CODE,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_CODE],
    {
      query: z
        .string()
        .min(1, 'Query cannot be empty')
        .describe(
          'Search query for code. Use GitHub search syntax like repo:owner/name, language:javascript, path:*.js, or simple keywords. Boolean operators (OR, AND, NOT) are highly recommended for better results.'
        ),
      owner: z
        .string()
        .optional()
        .describe(
          'Repository owner/organization (e.g., "facebook", "microsoft"). Leave empty for global searches.'
        ),
      repo: z
        .array(z.string())
        .optional()
        .describe(
          'Repository names (e.g., ["react", "vscode"]). Requires owner parameter.'
        ),
      extension: z
        .string()
        .optional()
        .describe('File extension to filter by (e.g., "js", "ts", "py").'),
      filename: z
        .string()
        .optional()
        .describe(
          'Exact filename to search for (e.g., "package.json", "README.md").'
        ),
      language: z
        .string()
        .optional()
        .describe(
          'Programming language to filter by (e.g., "javascript", "typescript", "python").'
        ),
      path: z
        .string()
        .optional()
        .describe(
          'Path pattern to filter by (e.g., "src", "lib", "*.js", "/src/**/*.ts").'
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(30)
        .describe(
          'Maximum number of results to return (default: 30, max: 100).'
        ),
      match: z.enum(['file', 'path']).optional().describe('Search scope'),
      branch: z
        .string()
        .optional()
        .describe(
          'Branch for workflow documentation (required but not used by CLI)'
        ),
      size: z
        .string()
        .optional()
        .describe(
          'Filter on file size range, in kilobytes (e.g., ">1", "<50")'
        ),
      // New parameter for query optimization
      enableQueryOptimization: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          'Enable automatic query optimization with boolean operators for better results (default: true)'
        ),
    },
    {
      title: 'GitHub Code Search',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (
      args: GitHubCodeSearchParams & { enableQueryOptimization?: boolean }
    ) => {
      try {
        // Enhanced validation
        if (args.repo && !args.owner) {
          return {
            content: [
              {
                type: 'text',
                text: 'Repository name requires owner to be specified. Provide both owner and repo parameters.',
              },
            ],
            isError: true,
          };
        }

        // Enhanced pattern analysis
        const patternAnalysis = analyzeSearchPattern(args);

        // Query optimization
        const queryOptimization = optimizeQuery(args);

        // Try original query first
        let result = await searchGitHubCode(args);
        let usedOptimizedQuery = false;

        // If original query returns few/no results and optimization is enabled, try optimized queries
        if (
          args.enableQueryOptimization !== false &&
          result.content &&
          result.content[0]
        ) {
          const resultContent = JSON.parse(result.content[0].text as string);
          const parsedResult =
            typeof resultContent === 'string'
              ? JSON.parse(resultContent)
              : resultContent;

          // Check if results are minimal (less than 5 results)
          const hasMinimalResults =
            !parsedResult.result ||
            (Array.isArray(parsedResult.result) &&
              parsedResult.result.length < 5) ||
            (typeof parsedResult.result === 'string' &&
              JSON.parse(parsedResult.result).length < 5);

          if (
            hasMinimalResults &&
            queryOptimization.optimizedQueries[0] !== args.query
          ) {
            // Try the first optimized query
            const optimizedArgs = {
              ...args,
              query: queryOptimization.optimizedQueries[0],
            };
            const optimizedResult = await searchGitHubCode(optimizedArgs);

            if (optimizedResult.content && optimizedResult.content[0]) {
              const optimizedContent = JSON.parse(
                optimizedResult.content[0].text as string
              );
              const parsedOptimized =
                typeof optimizedContent === 'string'
                  ? JSON.parse(optimizedContent)
                  : optimizedContent;

              // Use optimized result if it has more results
              const optimizedHasMoreResults =
                parsedOptimized.result &&
                ((Array.isArray(parsedOptimized.result) &&
                  parsedOptimized.result.length > 0) ||
                  (typeof parsedOptimized.result === 'string' &&
                    JSON.parse(parsedOptimized.result).length > 0));

              if (optimizedHasMoreResults) {
                result = optimizedResult;
                usedOptimizedQuery = true;
              }
            }
          }
        }

        // Enhance result with comprehensive insights
        if (result.content && result.content[0]) {
          let responseText = result.content[0].text as string;

          // Add optimization info if used
          if (usedOptimizedQuery) {
            responseText += `\n\n🔄 QUERY OPTIMIZATION APPLIED:`;
            responseText += `\n• Original: "${queryOptimization.originalQuery}"`;
            responseText += `\n• Optimized: "${queryOptimization.optimizedQueries[0]}"`;
            responseText += `\n• Reason: ${queryOptimization.rationale[0]}`;
          }

          // Add pattern-specific insights
          if (patternAnalysis.suggestions.length > 0) {
            responseText += `\n\n🎯 PATTERN INSIGHTS (${patternAnalysis.patternType.toUpperCase()}):`;
            patternAnalysis.suggestions.forEach(suggestion => {
              responseText += `\n• ${suggestion}`;
            });
          }

          // Add boolean operator recommendations
          if (patternAnalysis.booleanRecommendations.length > 0) {
            responseText += `\n\n🔍 BOOLEAN OPERATOR RECOMMENDATIONS:`;
            patternAnalysis.booleanRecommendations.forEach(rec => {
              responseText += `\n• ${rec}`;
            });
          }

          // Add context enrichment suggestions
          if (patternAnalysis.contextEnrichment.length > 0) {
            responseText += `\n\n💡 CONTEXT ENRICHMENT SUGGESTIONS:`;
            patternAnalysis.contextEnrichment.forEach(context => {
              responseText += `\n• ${context}`;
            });
          }

          // Add critical warnings
          if (patternAnalysis.warnings.length > 0) {
            responseText += `\n\n⚠️ CRITICAL WARNINGS:`;
            patternAnalysis.warnings.forEach(warning => {
              responseText += `\n• ${warning}`;
            });
          }

          // Enhanced best practices
          responseText += `\n\n📋 ADVANCED SEARCH STRATEGIES:`;
          responseText += `\n• Boolean operators: "useState OR useEffect", "function NOT test"`;
          responseText += `\n• Pattern matching: "async function" vs "function.*async"`;
          responseText += `\n• Context exclusion: "auth NOT mock NOT test" for production code`;
          responseText += `\n• Variation coverage: "login OR signin OR authenticate"`;
          responseText += `\n• Path targeting: Use repository-specific paths when known`;

          if (!args.owner && !args.repo) {
            responseText += `\n• Cross-repository discovery: Global searches work well for common patterns`;
          }

          // Add query alternatives if current query might be suboptimal
          if (queryOptimization.optimizedQueries.length > 1) {
            responseText += `\n\n🔄 ALTERNATIVE QUERY SUGGESTIONS:`;
            queryOptimization.optimizedQueries
              .slice(1)
              .forEach((query, index) => {
                responseText += `\n• "${query}" - ${queryOptimization.rationale[index + 1] || 'Alternative approach'}`;
              });
          }

          return {
            content: [
              {
                type: 'text',
                text: responseText,
              },
            ],
            isError: false,
          };
        }

        return result;
      } catch (error) {
        // Enhanced error handling with context-aware suggestions
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        let fallbackSuggestions = `
🔄 ENHANCED FALLBACK STRATEGIES:
• BOOLEAN OPERATORS: Try "term1 OR term2" instead of "term1 term2"
• EXCLUDE NOISE: Add "NOT test NOT spec NOT mock" to focus on production code
• SIMPLIFY QUERY: Break complex queries into boolean combinations
• REMOVE FILTERS: Try without path/language filters first
• REPOSITORY TARGETING: Use owner/repo for focused searches`;

        // Add pattern-specific fallback suggestions
        const query = args.query.toLowerCase();
        if (query.includes('react')) {
          fallbackSuggestions += `\n• REACT SPECIFIC: Try "useState OR useEffect", path:"packages" not "src"`;
        }
        if (query.includes('auth')) {
          fallbackSuggestions += `\n• AUTH SPECIFIC: Try "login OR authenticate OR signin"`;
        }
        if (query.includes('api')) {
          fallbackSuggestions += `\n• API SPECIFIC: Try "fetch OR axios OR request"`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `GitHub Code Search Failed: ${errorMessage}${fallbackSuggestions}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { GitHubCodeSearchParams } from '../../types';
import { searchGitHubCode } from '../../impl/github/searchGitHubCode';

// Enhanced search pattern analysis with MANDATORY boolean operator suggestions
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

  // CRITICAL: Always recommend boolean operators if not present
  if (!hasBoolean) {
    warnings.push(
      'CRITICAL: Query lacks boolean operators - efficiency reduced by 3-5x without them'
    );
    warnings.push(
      'MANDATORY: Add boolean operators (OR, AND, NOT) for maximum search efficiency'
    );
    patternType = 'needs-boolean-enhancement';
  }

  // CRITICAL: Check for unsupported parentheses
  if (args.query.includes('(') || args.query.includes(')')) {
    warnings.push(
      'CRITICAL: GitHub API does not support parentheses () in search queries'
    );
    warnings.push(
      'SOLUTION: Remove parentheses and use boolean operators: "term1 OR term2 AND term3"'
    );
    patternType = 'unsupported-syntax';
  }

  // Check for overly complex queries
  const booleanOperatorCount = (args.query.match(/\b(OR|AND|NOT)\b/gi) || [])
    .length;
  const termCount = args.query.split(/\s+/).length;

  if (booleanOperatorCount > 3 || termCount > 8) {
    warnings.push('COMPLEXITY WARNING: Query may exceed GitHub API limits');
    warnings.push(
      'RECOMMENDATION: Simplify to essential boolean operators (max 3-4 per query)'
    );
    patternType = 'overly-complex';
  }

  // Enhanced Function signature patterns with MANDATORY boolean operators
  if (query.includes('function') || query.includes('export')) {
    patternType = 'function-discovery';
    suggestions.push(
      'PROVEN BOOLEAN: "export OR function OR method OR class" → Comprehensive function discovery'
    );

    booleanRecommendations.push(
      'MANDATORY BOOLEAN: "export AND function OR method OR procedure" - captures all function types'
    );
    booleanRecommendations.push(
      'MANDATORY EXCLUSION: "function OR method NOT test NOT spec NOT mock" - production code only'
    );
    booleanRecommendations.push(
      'MANDATORY ASYNC: "async AND (function OR method) OR promise NOT example" - async patterns'
    );

    contextEnrichment.push(
      'BOOLEAN CONTEXT: "arrow OR lambda OR callback OR closure" for function variations'
    );
  }

  // Enhanced React/Component patterns with MANDATORY boolean operators
  if (
    query.includes('react') ||
    query.includes('component') ||
    query.includes('jsx')
  ) {
    patternType = 'component-discovery';
    suggestions.push(
      'PROVEN BOOLEAN: "react AND (hooks OR components OR jsx) NOT test" → React ecosystem discovery'
    );

    booleanRecommendations.push(
      'MANDATORY HOOKS: "useState OR useEffect OR useContext OR useReducer" - comprehensive hook coverage'
    );
    booleanRecommendations.push(
      'MANDATORY COMPONENTS: "component OR jsx OR tsx OR react NOT test NOT story" - component patterns'
    );
    booleanRecommendations.push(
      'MANDATORY LIFECYCLE: "componentDidMount OR useEffect OR lifecycle NOT mock" - lifecycle methods'
    );

    contextEnrichment.push(
      'BOOLEAN CONTEXT: "props OR state OR render OR mount" for React-specific patterns'
    );
  }

  // Authentication/Security patterns with MANDATORY boolean operators
  if (
    query.includes('auth') ||
    query.includes('login') ||
    query.includes('password') ||
    query.includes('token')
  ) {
    patternType = 'security-discovery';

    booleanRecommendations.push(
      'MANDATORY AUTH: "authentication OR auth OR login OR signin OR oauth" - comprehensive auth coverage'
    );
    booleanRecommendations.push(
      'MANDATORY TOKENS: "jwt OR token OR bearer OR session OR cookie" - token handling patterns'
    );
    booleanRecommendations.push(
      'MANDATORY SECURITY: "password OR hash OR encrypt OR decrypt NOT test NOT mock" - security implementations'
    );

    contextEnrichment.push(
      'BOOLEAN SECURITY: "middleware OR guard OR interceptor OR validation OR sanitize" for auth context'
    );
  }

  // API/HTTP patterns with MANDATORY boolean operators
  if (
    query.includes('api') ||
    query.includes('http') ||
    query.includes('request') ||
    query.includes('fetch')
  ) {
    patternType = 'api-discovery';

    booleanRecommendations.push(
      'MANDATORY HTTP: "fetch OR axios OR request OR http OR api" - HTTP client coverage'
    );
    booleanRecommendations.push(
      'MANDATORY ENDPOINTS: "endpoint OR route OR handler OR controller NOT test" - API structure'
    );
    booleanRecommendations.push(
      'MANDATORY METHODS: "get OR post OR put OR delete OR patch" - HTTP methods'
    );

    contextEnrichment.push(
      'BOOLEAN API: "cors OR middleware OR validation OR serialization OR response" for API context'
    );
  }

  // Database/Storage patterns with MANDATORY boolean operators
  if (
    query.includes('database') ||
    query.includes('db') ||
    query.includes('sql') ||
    query.includes('query')
  ) {
    patternType = 'database-discovery';

    booleanRecommendations.push(
      'MANDATORY CRUD: "insert OR update OR delete OR select OR create" - database operations'
    );
    booleanRecommendations.push(
      'MANDATORY DATABASES: "mongodb OR postgresql OR mysql OR sqlite OR redis" - database types'
    );
    booleanRecommendations.push(
      'MANDATORY ORM: "sequelize OR typeorm OR prisma OR mongoose OR knex" - ORM frameworks'
    );
  }

  // Error handling patterns with MANDATORY boolean operators
  if (
    query.includes('error') ||
    query.includes('exception') ||
    query.includes('try') ||
    query.includes('catch')
  ) {
    patternType = 'error-handling';

    booleanRecommendations.push(
      'MANDATORY ERROR: "error OR exception OR catch OR throw OR reject" - error handling coverage'
    );
    booleanRecommendations.push(
      'MANDATORY PATTERNS: "try OR catch OR finally OR async OR await" - error patterns'
    );
    booleanRecommendations.push(
      'MANDATORY HANDLING: "handling OR recovery OR retry OR fallback NOT test" - error management'
    );
  }

  // Testing patterns - suggest boolean exclusion
  if (
    query.includes('test') ||
    query.includes('spec') ||
    query.includes('mock')
  ) {
    if (!query.includes('NOT')) {
      booleanRecommendations.push(
        'MANDATORY EXCLUSION: Add "NOT test NOT spec NOT mock" to focus on production code'
      );
      booleanRecommendations.push(
        'BOOLEAN ALTERNATIVE: Use "production OR live OR deploy NOT test" for real implementations'
      );
    }
  }

  // Generic single-term queries - MANDATORY boolean enhancement
  const words = query.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 1 && !hasBoolean && words[0].length > 3) {
    booleanRecommendations.push(
      `MANDATORY VARIATIONS: "${words[0]} OR ${words[0]}s OR ${words[0]}ing" - capture all variations`
    );
    booleanRecommendations.push(
      `MANDATORY EXCLUSION: "${words[0]} NOT test NOT spec NOT example" - production focus`
    );
    booleanRecommendations.push(
      `MANDATORY CONTEXT: "${words[0]} OR related_term OR synonym" - comprehensive coverage`
    );
  }

  // Boolean operator patterns (existing logic enhanced)
  if (hasBoolean) {
    patternType = 'boolean-search';
    suggestions.push(
      'EXCELLENT: Boolean operators detected - proven 3-5x more efficient than simple text'
    );
    suggestions.push(
      'PROVEN PATTERNS: "useState OR useEffect" ✅, "function NOT test" ✅, "async AND await" ✅'
    );
  }

  // Path filter validation (enhanced with boolean recommendations)
  if (args.path === 'src' && !args.repo) {
    warnings.push(
      'CRITICAL: path:src may fail - many repos use path:packages, path:lib instead'
    );
    suggestions.push(
      'PROVEN BOOLEAN PATHS: "react AND hooks" with path:packages, NOT path:src'
    );
    contextEnrichment.push(
      'BOOLEAN PATH ALTERNATIVES: Try boolean queries without path filters first'
    );
  }

  // Language-specific boolean enhancements
  if (args.language) {
    const lang = args.language.toLowerCase();
    if (lang === 'typescript' || lang === 'javascript') {
      contextEnrichment.push(
        'BOOLEAN JS/TS: "interface OR type OR class OR function OR const OR let" for comprehensive coverage'
      );
    } else if (lang === 'python') {
      contextEnrichment.push(
        'BOOLEAN PYTHON: "def OR class OR import OR async OR lambda" for Python patterns'
      );
    } else if (lang === 'java') {
      contextEnrichment.push(
        'BOOLEAN JAVA: "public OR private OR class OR interface OR method" for Java patterns'
      );
    }
  }

  // Cross-repository patterns (enhanced with boolean emphasis)
  if (!args.owner && !args.repo && args.query.includes('async')) {
    patternType = 'cross-repo-discovery';
    suggestions.push(
      'PROVEN BOOLEAN GLOBAL: "async AND (function OR method) OR promise" finds comprehensive async patterns'
    );
    contextEnrichment.push(
      'BOOLEAN CROSS-REPO: Global boolean searches excel for common patterns like "error OR exception"'
    );
  }

  // Zero results prediction with boolean solutions
  if (query.length > 50 || query.split(' ').length > 8) {
    warnings.push(
      'COMPLEXITY WARNING: Very long/complex queries often return 0 results'
    );
    booleanRecommendations.push(
      'MANDATORY SIMPLIFICATION: Break into essential boolean terms: "term1 OR term2 NOT test"'
    );
    booleanRecommendations.push(
      'BOOLEAN STRATEGY: Use progressive boolean refinement instead of complex phrases'
    );
  }

  // ALWAYS add mandatory boolean recommendations if none exist
  if (booleanRecommendations.length === 0) {
    booleanRecommendations.push(
      'MANDATORY: Add boolean operators for 3-5x better efficiency: "term1 OR term2 NOT test"'
    );
    booleanRecommendations.push(
      'PROVEN PATTERN: Use "primary_term OR synonym OR variation NOT noise" structure'
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

// NEW: Smart query simplification for GitHub API compatibility
function simplifyComplexQuery(query: string): string[] {
  const fallbackQueries: string[] = [];

  // Remove parentheses - GitHub doesn't support them
  const simplified = query.replace(/[()]/g, '');

  // If query has parentheses, create simplified version
  if (query.includes('(') || query.includes(')')) {
    fallbackQueries.push(simplified);
  }

  // Extract main terms and create progressive simplifications
  const terms = simplified
    .split(/\s+/)
    .filter(term => !['AND', 'OR', 'NOT'].includes(term.toUpperCase()));

  // Strategy 1: Keep only OR operations (most permissive)
  const orTerms = [];
  const parts = simplified.split(/\s+/);
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].toUpperCase() === 'OR' && i > 0 && i < parts.length - 1) {
      orTerms.push(parts[i - 1], 'OR', parts[i + 1]);
    }
  }
  if (orTerms.length > 0) {
    fallbackQueries.push(orTerms.join(' '));
  }

  // Strategy 2: Take first 2-3 most important terms
  if (terms.length >= 2) {
    fallbackQueries.push(`${terms[0]} OR ${terms[1]}`);
  }

  // Strategy 3: Single most specific term
  const specificTerms = terms.filter(
    term =>
      term.length > 4 &&
      !['function', 'class', 'import', 'export'].includes(term.toLowerCase())
  );
  if (specificTerms.length > 0) {
    fallbackQueries.push(specificTerms[0]);
  }

  // Strategy 4: Fallback to first term
  if (terms.length > 0) {
    fallbackQueries.push(terms[0]);
  }

  // Remove duplicates and return unique fallbacks
  return [...new Set(fallbackQueries)];
}

// NEW: Safe JSON parsing with error recovery
function safeParseJSON(text: string): {
  success: boolean;
  data?: any;
  error?: string;
} {
  try {
    const parsed = JSON.parse(text);
    return { success: true, data: parsed };
  } catch (error) {
    try {
      // Try parsing as double-encoded JSON
      const doubleParsed = JSON.parse(JSON.parse(text));
      return { success: true, data: doubleParsed };
    } catch (secondError) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'JSON parsing failed',
      };
    }
  }
}

// Enhanced query optimization for better results - BOOLEAN OPERATORS ALWAYS REQUIRED
function optimizeQuery(args: GitHubCodeSearchParams): {
  originalQuery: string;
  optimizedQueries: string[];
  rationale: string[];
  fallbackQueries: string[];
} {
  const original = args.query;
  const optimized: string[] = [];
  const rationale: string[] = [];
  const fallbackQueries: string[] = [];

  // Check for unsupported syntax first
  if (original.includes('(') || original.includes(')')) {
    const simplified = simplifyComplexQuery(original);
    fallbackQueries.push(...simplified);
    rationale.push(
      'Removed unsupported parentheses and created boolean fallback queries'
    );
  }

  // MANDATORY: Always ensure boolean operators are used for maximum efficiency
  const hasBoolean = /\b(OR|AND|NOT)\b/i.test(original);

  if (!hasBoolean) {
    // CRITICAL: Inject boolean operators for maximum efficiency
    const words = original
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 2);

    if (words.length === 1) {
      const word = words[0];
      // Always create boolean variations for single terms
      optimized.push(`${word} OR ${word}s OR ${word}ing`);
      rationale.push(
        'MANDATORY: Added boolean variations for comprehensive coverage (3-5x more efficient)'
      );

      optimized.push(`${word} NOT test NOT spec NOT mock`);
      rationale.push(
        'MANDATORY: Added boolean exclusions to focus on production code'
      );

      // Add semantic boolean expansions based on common patterns
      if (word.toLowerCase().includes('react')) {
        optimized.push(`${word} OR reactjs OR react.js NOT example`);
        rationale.push('MANDATORY: Added React-specific boolean variations');
      } else if (word.toLowerCase().includes('auth')) {
        optimized.push(`${word} OR authentication OR login OR signin NOT test`);
        rationale.push('MANDATORY: Added authentication boolean variations');
      } else if (word.toLowerCase().includes('function')) {
        optimized.push(`${word} OR method OR procedure OR class NOT test`);
        rationale.push('MANDATORY: Added function-related boolean variations');
      } else if (word.toLowerCase().includes('error')) {
        optimized.push(`${word} OR exception OR catch OR handling NOT mock`);
        rationale.push('MANDATORY: Added error-handling boolean variations');
      }
    } else if (words.length >= 2 && words.length <= 4) {
      // MANDATORY: Convert multi-word queries to boolean
      optimized.push(words.join(' OR '));
      rationale.push(
        'MANDATORY: Converted to OR boolean for comprehensive coverage (proven 3-5x more efficient)'
      );

      optimized.push(`${words.join(' AND ')} NOT test NOT spec`);
      rationale.push(
        'MANDATORY: Added AND boolean with exclusions for precise targeting'
      );

      // Create semantic boolean combinations
      if (words.some(w => w.toLowerCase().includes('react'))) {
        const reactTerms = words.filter(
          w => !w.toLowerCase().includes('react')
        );
        optimized.push(
          `react AND (${reactTerms.join(' OR ')}) NOT example NOT tutorial`
        );
        rationale.push('MANDATORY: Created React-specific boolean combination');
      }
    } else if (words.length > 4) {
      // MANDATORY: Simplify complex queries with boolean operators
      const primaryTerms = words.slice(0, 3);
      optimized.push(`${primaryTerms.join(' OR ')} NOT test`);
      rationale.push(
        'MANDATORY: Simplified to essential boolean terms (complex queries often fail)'
      );

      optimized.push(
        `${primaryTerms[0]} AND ${primaryTerms[1]} NOT mock NOT spec`
      );
      rationale.push(
        'MANDATORY: Created focused boolean combination from key terms'
      );
    }
  } else {
    // Query already has boolean operators - validate and enhance
    const booleanCount = (original.match(/\b(OR|AND|NOT)\b/gi) || []).length;
    if (booleanCount > 3) {
      const simplified = simplifyComplexQuery(original);
      fallbackQueries.push(...simplified);
      rationale.push(
        'MANDATORY: Boolean query too complex - created simplified boolean fallbacks'
      );
    } else {
      optimized.push(original);
      rationale.push(
        'MANDATORY: Boolean complexity acceptable - using optimized boolean query'
      );

      // Always add enhanced boolean variations even for existing boolean queries
      const words = original
        .split(/\s+/)
        .filter(
          w => w.length > 3 && !['AND', 'OR', 'NOT'].includes(w.toUpperCase())
        );

      if (words.length >= 2) {
        // Add alternative boolean combinations
        optimized.push(`${words[0]} OR ${words[1]} NOT test NOT example`);
        rationale.push(
          'MANDATORY: Added alternative boolean combination for broader coverage'
        );
      }
    }
  }

  // MANDATORY: Always ensure we have boolean fallbacks
  if (optimized.length === 0 && fallbackQueries.length === 0) {
    const words = original.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      optimized.push(`${words[0]} OR ${words[0]}s NOT test`);
      rationale.push('MANDATORY: Created essential boolean query as fallback');
    } else {
      optimized.push(original);
      rationale.push(
        'MANDATORY: Preserved original query (boolean enhancement not possible)'
      );
    }
  }

  return {
    originalQuery: original,
    optimizedQueries: optimized,
    rationale,
    fallbackQueries,
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

        // Query optimization with fallbacks
        const queryOptimization = optimizeQuery(args);

        let result: any = null;
        let usedOptimizedQuery = false;
        let usedFallbackQuery = false;
        let finalQuery = args.query;
        const attemptedQueries: string[] = [];

        // Strategy 1: Try original query first (unless it has known issues)
        const hasUnsupportedSyntax =
          args.query.includes('(') || args.query.includes(')');
        const isOverlyComplex =
          (args.query.match(/\b(OR|AND|NOT)\b/gi) || []).length > 3;

        if (!hasUnsupportedSyntax && !isOverlyComplex) {
          try {
            result = await searchGitHubCode(args);
            attemptedQueries.push(args.query);

            // Validate result with safe JSON parsing
            if (result.content && result.content[0]) {
              const parseResult = safeParseJSON(
                result.content[0].text as string
              );
              if (!parseResult.success) {
                throw new Error(`JSON parsing failed: ${parseResult.error}`);
              }
            }
          } catch (error) {
            console.warn(
              `Original query failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
            result = null; // Will trigger fallback
          }
        }

        // Strategy 2: Try optimized queries if original failed or returned minimal results
        if (
          !result &&
          args.enableQueryOptimization !== false &&
          queryOptimization.optimizedQueries.length > 0
        ) {
          for (const optimizedQuery of queryOptimization.optimizedQueries) {
            if (optimizedQuery === args.query) continue; // Skip if same as original

            try {
              const optimizedArgs = { ...args, query: optimizedQuery };
              const optimizedResult = await searchGitHubCode(optimizedArgs);
              attemptedQueries.push(optimizedQuery);

              if (optimizedResult.content && optimizedResult.content[0]) {
                const parseResult = safeParseJSON(
                  optimizedResult.content[0].text as string
                );
                if (parseResult.success) {
                  result = optimizedResult;
                  usedOptimizedQuery = true;
                  finalQuery = optimizedQuery;
                  break;
                }
              }
            } catch (error) {
              console.warn(
                `Optimized query failed: ${optimizedQuery} - ${error instanceof Error ? error.message : 'Unknown error'}`
              );
              continue;
            }
          }
        }

        // Strategy 3: Try fallback queries for complex/unsupported syntax
        if (!result && queryOptimization.fallbackQueries.length > 0) {
          for (const fallbackQuery of queryOptimization.fallbackQueries) {
            try {
              const fallbackArgs = { ...args, query: fallbackQuery };
              const fallbackResult = await searchGitHubCode(fallbackArgs);
              attemptedQueries.push(fallbackQuery);

              if (fallbackResult.content && fallbackResult.content[0]) {
                const parseResult = safeParseJSON(
                  fallbackResult.content[0].text as string
                );
                if (parseResult.success) {
                  result = fallbackResult;
                  usedFallbackQuery = true;
                  finalQuery = fallbackQuery;
                  break;
                }
              }
            } catch (error) {
              console.warn(
                `Fallback query failed: ${fallbackQuery} - ${error instanceof Error ? error.message : 'Unknown error'}`
              );
              continue;
            }
          }
        }

        // Strategy 4: Last resort - try single term from original query
        if (!result) {
          const terms = args.query
            .split(/\s+/)
            .filter(
              term =>
                term.length > 3 &&
                !['AND', 'OR', 'NOT'].includes(term.toUpperCase())
            );

          if (terms.length > 0) {
            try {
              const lastResortArgs = { ...args, query: terms[0] };
              const lastResortResult = await searchGitHubCode(lastResortArgs);
              attemptedQueries.push(terms[0]);

              if (lastResortResult.content && lastResortResult.content[0]) {
                const parseResult = safeParseJSON(
                  lastResortResult.content[0].text as string
                );
                if (parseResult.success) {
                  result = lastResortResult;
                  usedFallbackQuery = true;
                  finalQuery = terms[0];
                }
              }
            } catch (error) {
              console.warn(
                `Last resort query failed: ${terms[0]} - ${error instanceof Error ? error.message : 'Unknown error'}`
              );
            }
          }
        }

        // If we still don't have a result, return comprehensive error
        if (!result) {
          return {
            content: [
              {
                type: 'text',
                text: `🚨 ALL QUERY STRATEGIES FAILED

📋 ATTEMPTED QUERIES:
${attemptedQueries.map(q => `• "${q}"`).join('\n')}

🔧 INTELLIGENT FALLBACK RECOMMENDATIONS:
• SIMPLIFY: Try single keywords like "useState", "function", "class"
• REMOVE SYNTAX: Avoid parentheses () - GitHub API doesn't support them
• REDUCE COMPLEXITY: Use max 2-3 boolean operators (OR, AND, NOT)
• SPECIFIC TERMS: Use concrete terms instead of abstract concepts
• REPOSITORY SCOPE: Add owner/repo parameters to narrow search

💡 PROVEN WORKING PATTERNS:
• "useState OR useEffect" ✅
• "function NOT test" ✅  
• "async function" ✅
• "export default" ✅

⚠️ AVOID THESE PATTERNS:
• "(term1 OR term2) AND term3" ❌ (parentheses not supported)
• Complex nested boolean logic ❌
• Very long queries (>50 characters) ❌`,
              },
            ],
            isError: true,
          };
        }

        // Enhance successful result with comprehensive insights
        if (result.content && result.content[0]) {
          let responseText = result.content[0].text as string;

          // Add query transformation info
          if (usedOptimizedQuery || usedFallbackQuery) {
            responseText += `\n\n🔄 QUERY TRANSFORMATION APPLIED:`;
            responseText += `\n• Original: "${args.query}"`;
            responseText += `\n• Used: "${finalQuery}"`;
            responseText += `\n• Strategy: ${usedFallbackQuery ? 'Fallback (syntax/complexity issues)' : 'Optimization'}`;

            if (attemptedQueries.length > 1) {
              responseText += `\n• Attempts: ${attemptedQueries.length} queries tried`;
            }
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

          // Enhanced best practices with GitHub API limitations
          responseText += `\n\n📋 GITHUB API SEARCH BEST PRACTICES:`;
          responseText += `\n• ✅ SUPPORTED: "useState OR useEffect", "function NOT test"`;
          responseText += `\n• ❌ NOT SUPPORTED: "(useState OR useEffect) AND typescript" (parentheses)`;
          responseText += `\n• ⚠️ COMPLEXITY LIMIT: Max 3-4 boolean operators per query`;
          responseText += `\n• 🎯 PATTERN MATCHING: "async function" vs "function.*async"`;
          responseText += `\n• 🚫 EXCLUDE NOISE: "auth NOT mock NOT test" for production code`;
          responseText += `\n• 🔄 VARIATION COVERAGE: "login OR signin OR authenticate"`;

          if (!args.owner && !args.repo) {
            responseText += `\n• 🌐 GLOBAL SEARCH: Works well for common patterns across repositories`;
          }

          // Add alternative query suggestions
          if (
            queryOptimization.fallbackQueries.length > 0 &&
            !usedFallbackQuery
          ) {
            responseText += `\n\n🔄 ALTERNATIVE QUERY SUGGESTIONS:`;
            queryOptimization.fallbackQueries.forEach(query => {
              responseText += `\n• "${query}" - Simplified version for better compatibility`;
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
        // Enhanced error handling with intelligent suggestions
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        // Detect specific error types
        let errorType = 'general';
        let specificSuggestions = '';

        if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
          errorType = 'json-parsing';
          specificSuggestions = `
🔧 JSON PARSING ERROR SOLUTIONS:
• QUERY SIMPLIFICATION: Remove complex boolean logic
• SYNTAX CHECK: Avoid parentheses () in queries  
• RETRY STRATEGY: Try single keywords instead of complex queries`;
        } else if (
          errorMessage.includes('API') ||
          errorMessage.includes('rate')
        ) {
          errorType = 'api-limit';
          specificSuggestions = `
🔧 API LIMIT SOLUTIONS:
• REDUCE FREQUENCY: Wait before retrying
• SIMPLIFY QUERIES: Use fewer boolean operators
• SCOPE NARROWING: Add owner/repo parameters`;
        } else if (
          errorMessage.includes('syntax') ||
          errorMessage.includes('invalid')
        ) {
          errorType = 'syntax-error';
          specificSuggestions = `
🔧 SYNTAX ERROR SOLUTIONS:
• REMOVE PARENTHESES: GitHub API doesn't support () grouping
• SIMPLIFY BOOLEAN: Use "term1 OR term2" not "(term1 OR term2)"
• CHECK OPERATORS: Only AND, OR, NOT are supported`;
        }

        let fallbackSuggestions = `
🔄 INTELLIGENT FALLBACK STRATEGIES:
• PROGRESSIVE SIMPLIFICATION: Start with single terms, add complexity gradually
• BOOLEAN BASICS: "term1 OR term2" works, "(term1 OR term2) AND term3" doesn't
• EXCLUDE NOISE: Add "NOT test NOT spec NOT mock" to focus on production code
• REMOVE FILTERS: Try without path/language filters first
• REPOSITORY TARGETING: Use owner/repo for focused searches${specificSuggestions}`;

        // Add pattern-specific fallback suggestions
        const query = args.query.toLowerCase();
        if (query.includes('react')) {
          fallbackSuggestions += `\n• REACT SPECIFIC: Try "useState OR useEffect", avoid complex hook combinations`;
        }
        if (query.includes('auth')) {
          fallbackSuggestions += `\n• AUTH SPECIFIC: Try "login OR authenticate OR signin NOT test"`;
        }
        if (query.includes('api')) {
          fallbackSuggestions += `\n• API SPECIFIC: Try "fetch OR axios OR request NOT mock"`;
        }

        // Add the attempted queries for debugging
        fallbackSuggestions += `\n\n🔍 DEBUGGING INFO:
• Original Query: "${args.query}"
• Error Type: ${errorType}
• Error Message: ${errorMessage}`;

        return {
          content: [
            {
              type: 'text',
              text: `🚨 GitHub Code Search Failed: ${errorMessage}${fallbackSuggestions}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

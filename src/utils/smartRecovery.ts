import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { TOOL_NAMES } from '../mcp/contstants';

// Universal Error Recovery Framework
export interface SmartRecoveryOptions {
  tool: string;
  query?: string;
  packageName?: string;
  owner?: string;
  repo?: string;
  context: Record<string, unknown> | object;
  resultCount?: number;
  error: Error;
}

export interface RecoveryStrategy {
  priority: number;
  description: string;
  targetTool: string;
  rationale: string;
  modifiedQuery?: string;
  additionalParams?: Record<string, unknown>;
}

export interface ToolSuggestion {
  tool: string;
  reason: string;
  confidence: number;
  queryModification?: string;
}

// Cross-Tool Orchestration Chains
const TOOL_FALLBACK_CHAINS = {
  'package-discovery': [
    { tool: TOOL_NAMES.NPM_SEARCH_PACKAGES, reason: 'Primary package search' },
    {
      tool: TOOL_NAMES.GITHUB_SEARCH_TOPICS,
      reason: 'Ecosystem terminology discovery',
    },
    {
      tool: TOOL_NAMES.GITHUB_SEARCH_REPOS,
      reason: 'Repository-based discovery',
    },
    {
      tool: TOOL_NAMES.GITHUB_SEARCH_CODE,
      reason: 'Code implementation search',
    },
  ],
  'code-discovery': [
    { tool: TOOL_NAMES.GITHUB_SEARCH_CODE, reason: 'Direct code search' },
    { tool: TOOL_NAMES.GITHUB_SEARCH_REPOS, reason: 'Project-level discovery' },
    { tool: TOOL_NAMES.NPM_SEARCH_PACKAGES, reason: 'Package-based solutions' },
    {
      tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES,
      reason: 'Problem discussion search',
    },
  ],
  'repository-discovery': [
    { tool: TOOL_NAMES.NPM_GET_REPOSITORY, reason: 'Package-to-repo mapping' },
    {
      tool: TOOL_NAMES.GITHUB_SEARCH_REPOS,
      reason: 'Direct repository search',
    },
    { tool: TOOL_NAMES.GITHUB_SEARCH_TOPICS, reason: 'Topic-based discovery' },
    { tool: TOOL_NAMES.GITHUB_SEARCH_USERS, reason: 'Organization discovery' },
  ],
  'issue-discovery': [
    { tool: TOOL_NAMES.GITHUB_SEARCH_ISSUES, reason: 'Primary issue search' },
    {
      tool: TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS,
      reason: 'Solution implementation search',
    },
    { tool: TOOL_NAMES.GITHUB_SEARCH_CODE, reason: 'Code example search' },
    {
      tool: TOOL_NAMES.GITHUB_SEARCH_REPOS,
      reason: 'Related project discovery',
    },
  ],
  'user-discovery': [
    { tool: TOOL_NAMES.GITHUB_SEARCH_USERS, reason: 'Primary user search' },
    {
      tool: TOOL_NAMES.GITHUB_GET_USER_ORGS,
      reason: 'Organization membership discovery',
    },
    { tool: TOOL_NAMES.GITHUB_SEARCH_REPOS, reason: 'User project discovery' },
    { tool: TOOL_NAMES.GITHUB_SEARCH_CODE, reason: 'Contribution analysis' },
  ],
};

// Query Simplification Utilities
export class QueryOptimizer {
  static getProgressiveQueries(originalQuery: string): string[] {
    const queries: string[] = [];

    // Original query
    queries.push(originalQuery);

    // Remove special characters and clean up
    const cleaned = originalQuery.replace(/[^\w\s-]/g, ' ').trim();
    if (cleaned !== originalQuery) {
      queries.push(cleaned);
    }

    // Extract key terms (remove common words)
    const stopWords = [
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
    ];
    const terms = cleaned
      .split(/\s+/)
      .filter(
        term => term.length > 2 && !stopWords.includes(term.toLowerCase())
      );

    // Multiple key terms
    if (terms.length >= 2) {
      queries.push(terms.slice(0, 2).join(' '));
    }

    // Single most important term
    if (terms.length >= 1) {
      queries.push(terms[0]);
    }

    // Remove duplicates and return
    return [...new Set(queries)];
  }

  static simplifyPackageName(packageName: string): string[] {
    const variations: string[] = [packageName];

    // Remove scope if present
    if (packageName.startsWith('@')) {
      const withoutScope = packageName.split('/')[1];
      if (withoutScope) {
        variations.push(withoutScope);
      }
    }

    // Remove common suffixes
    const suffixes = ['-js', '-node', '-lib', '-tool', '-cli', '-api'];
    suffixes.forEach(suffix => {
      if (packageName.endsWith(suffix)) {
        variations.push(packageName.slice(0, -suffix.length));
      }
    });

    return [...new Set(variations)];
  }
}

// Context Analysis
export class ContextAnalyzer {
  static analyzeQuery(query: string): {
    type: 'package' | 'code' | 'repository' | 'issue' | 'user' | 'general';
    keywords: string[];
    complexity: 'simple' | 'medium' | 'complex';
    suggestions: string[];
  } {
    const lowerQuery = query.toLowerCase();
    const keywords = query.split(/\s+/).filter(term => term.length > 2);

    // Determine query type
    let type: 'package' | 'code' | 'repository' | 'issue' | 'user' | 'general' =
      'general';

    if (
      lowerQuery.includes('npm') ||
      lowerQuery.includes('package') ||
      lowerQuery.includes('install')
    ) {
      type = 'package';
    } else if (
      lowerQuery.includes('function') ||
      lowerQuery.includes('class') ||
      lowerQuery.includes('import')
    ) {
      type = 'code';
    } else if (
      lowerQuery.includes('repo') ||
      lowerQuery.includes('project') ||
      lowerQuery.includes('github')
    ) {
      type = 'repository';
    } else if (
      lowerQuery.includes('bug') ||
      lowerQuery.includes('issue') ||
      lowerQuery.includes('problem')
    ) {
      type = 'issue';
    } else if (
      lowerQuery.includes('user') ||
      lowerQuery.includes('developer') ||
      lowerQuery.includes('maintainer')
    ) {
      type = 'user';
    }

    // Determine complexity
    const complexity =
      keywords.length <= 1
        ? 'simple'
        : keywords.length <= 3
          ? 'medium'
          : 'complex';

    // Generate suggestions
    const suggestions: string[] = [];
    if (complexity === 'complex') {
      suggestions.push('Try breaking down into simpler terms');
      suggestions.push('Use 1-2 key words instead of full phrases');
    }

    return { type, keywords, complexity, suggestions };
  }

  static getToolChain(
    queryType: string
  ): Array<{ tool: string; reason: string }> {
    const chainKey =
      `${queryType}-discovery` as keyof typeof TOOL_FALLBACK_CHAINS;
    return (
      TOOL_FALLBACK_CHAINS[chainKey] ||
      TOOL_FALLBACK_CHAINS['package-discovery']
    );
  }
}

// Enhanced Error Recovery
export function generateSmartRecovery(
  options: SmartRecoveryOptions
): CallToolResult {
  const { tool, query, packageName, resultCount, error } = options;

  const queryAnalysis = query ? ContextAnalyzer.analyzeQuery(query) : null;
  const simplifiedQueries = query
    ? QueryOptimizer.getProgressiveQueries(query)
    : [];
  const packageVariations = packageName
    ? QueryOptimizer.simplifyPackageName(packageName)
    : [];

  // Determine appropriate tool chain
  const toolChain = queryAnalysis
    ? ContextAnalyzer.getToolChain(queryAnalysis.type)
    : TOOL_FALLBACK_CHAINS['package-discovery'];

  // Build comprehensive recovery message
  let recoveryText = `${tool} failed: ${error.message}`;

  // Context-specific analysis
  if (queryAnalysis) {
    recoveryText += `

🔍 QUERY ANALYSIS:
• Type: ${queryAnalysis.type.toUpperCase()} search
• Complexity: ${queryAnalysis.complexity.toUpperCase()}
• Keywords: ${queryAnalysis.keywords.join(', ')}`;

    if (queryAnalysis.suggestions.length > 0) {
      recoveryText += `
• Suggestions: ${queryAnalysis.suggestions.join(', ')}`;
    }
  }

  // Query simplification suggestions
  if (simplifiedQueries.length > 1) {
    recoveryText += `

🔄 SIMPLIFIED QUERY OPTIONS:
${simplifiedQueries
  .slice(1)
  .map((q, i) => `${i + 1}. "${q}"`)
  .join('\n')}`;
  }

  // Package name variations
  if (packageVariations.length > 1) {
    recoveryText += `

📦 PACKAGE NAME VARIATIONS:
${packageVariations
  .slice(1)
  .map((v, i) => `${i + 1}. "${v}"`)
  .join('\n')}`;
  }

  // Cross-tool recommendations
  recoveryText += `

🔗 ALTERNATIVE TOOL CHAIN:
${toolChain.map((t, i) => `${i + 1}. ${t.tool} - ${t.reason}`).join('\n')}`;

  // Specific error type handling
  if (error.message.includes('404') || error.message.includes('not found')) {
    recoveryText += `

💡 NOT FOUND RECOVERY:
• Check spelling and exact names
• Try search tools instead of direct access
• Use broader discovery methods first`;
  }

  if (error.message.includes('API') || error.message.includes('rate limit')) {
    recoveryText += `

⏱️ API LIMIT RECOVERY:
• Wait a moment before retrying
• Use simpler queries to reduce API usage
• Try different tools that may use different API endpoints`;
  }

  // General best practices
  recoveryText += `

📋 PROVEN RECOVERY WORKFLOW:
1. Start with search tools (npm_search_packages, github_search_repos)
2. Use discovery results to guide specific tool usage
3. Progressively simplify queries if needed
4. Try alternative tool chains for different perspectives`;

  // Context-specific recommendations
  if (resultCount === 0) {
    recoveryText += `

🎯 ZERO RESULTS STRATEGY:
• Broaden search terms
• Remove restrictive filters
• Try ecosystem discovery tools
• Use single keywords instead of phrases`;
  }

  return {
    content: [
      {
        type: 'text',
        text: recoveryText,
      },
    ],
    isError: true,
  };
}

// Helper function for specific tool categories
export function getToolCategoryRecovery(
  toolName: string,
  _errorMessage: string,
  _context: Record<string, unknown>
): string {
  if (toolName.startsWith('npm_get_')) {
    return `
🔄 NPM TOOL RECOVERY:
• Try npm_search_packages first for discovery
• Check package name variations
• Use github_search_repos for alternative discovery`;
  }

  if (toolName.includes('github_search_')) {
    return `
🔄 GITHUB SEARCH RECOVERY:
• Simplify query terms
• Remove restrictive filters
• Try broader discovery tools first`;
  }

  if (toolName.includes('github_get_')) {
    return `
🔄 GITHUB ACCESS RECOVERY:
• Verify repository exists and is accessible
• Check branch/path names
• Try search tools for discovery first`;
  }

  return `
🔄 GENERAL RECOVERY:
• Try discovery tools before specific access
• Use simpler queries
• Follow recommended tool chains`;
}

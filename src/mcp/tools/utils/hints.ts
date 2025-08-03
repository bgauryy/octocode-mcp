/**
 * Unified Hint System for Octocode-MCP Tools
 *
 * This module provides intelligent, context-aware hint generation for all tools.
 * It consolidates strategic navigation, error recovery, and research guidance
 * into a single, coherent system optimized for LLM reasoning.
 */

import { TOOL_NAMES, ToolName, ResearchGoal } from './toolConstants';
import { extractErrorContext, getSemanticAlternatives } from './queryUtils';

// ============================================================================
// CORE TYPES & INTERFACES
// ============================================================================

export interface HintGenerationContext {
  toolName: ToolName;
  researchGoal?: ResearchGoal | string;
  hasResults?: boolean;
  totalItems?: number;
  errorMessage?: string;
  customHints?: string[];
  previousTools?: ToolName[];
  queryContext?: {
    owner?: string | string[];
    repo?: string | string[];
    queryTerms?: string[];
    language?: string;
    searchScope?: 'broad' | 'focused' | 'targeted';
  };
  responseContext?: {
    foundRepositories?: string[];
    foundFiles?: string[];
    foundLanguages?: string[];
    foundTopics?: string[];
    dataQuality?: {
      hasContent?: boolean;
      hasMatches?: boolean;
      hasPopularResults?: boolean;
    };
  };
}

export interface PrioritizedHint {
  content: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  category:
    | 'error_recovery'
    | 'strategic_navigation'
    | 'research_guidance'
    | 'contextual_insight';
  confidence: number;
  source:
    | 'error_analysis'
    | 'tool_relationships'
    | 'research_goals'
    | 'response_data';
}

export interface HintGenerationResult {
  hints: string[];
  metadata: {
    totalGenerated: number;
    priorityBreakdown: Record<string, number>;
    sources: string[];
    researchPhase: 'discovery' | 'analysis' | 'deep_dive' | 'synthesis';
  };
}

// ============================================================================
// RESEARCH-ORIENTED HINT PATTERNS
// ============================================================================

/**
 * Adaptive research guidance patterns that generate contextual hints
 * based on the current research phase and findings
 */
export const RESEARCH_GUIDANCE_PATTERNS: Record<
  ResearchGoal,
  (context: HintGenerationContext) => string[]
> = {
  [ResearchGoal.DISCOVERY]: context => {
    const hints: string[] = [];
    const { responseContext } = context;

    if (context.hasResults) {
      if (
        responseContext?.foundRepositories &&
        responseContext.foundRepositories.length > 1
      ) {
        hints.push(
          'Compare implementations across multiple repositories to identify common patterns and best practices'
        );
      }
      hints.push(
        'Progressively narrow your search focus based on the most relevant findings'
      );
      hints.push(
        'Cross-reference results with related projects to validate approaches and discover alternatives'
      );
    } else {
      hints.push(
        'Start with broader search terms and gradually refine based on initial discoveries'
      );
      hints.push(
        'Explore related technologies, frameworks, or problem domains for comprehensive coverage'
      );
    }

    return hints;
  },

  [ResearchGoal.CODE_GENERATION]: context => {
    const hints: string[] = [];
    const { responseContext } = context;

    if (context.hasResults) {
      if (responseContext?.foundFiles?.some(f => f.includes('test'))) {
        hints.push(
          'Examine test files to understand expected behavior, usage patterns, and edge cases'
        );
      }
      hints.push(
        'Study complete implementations to understand architectural decisions and design patterns'
      );
      hints.push(
        'Look for documentation and examples to understand intended usage and best practices'
      );

      if (
        responseContext?.foundRepositories &&
        responseContext.foundRepositories.length > 1
      ) {
        hints.push(
          'Compare different implementation approaches to identify the most suitable pattern for your needs'
        );
      }
    } else {
      hints.push(
        'Search for working examples and reference implementations in popular repositories'
      );
      hints.push(
        'Look for official documentation, tutorials, or starter templates'
      );
    }

    return hints;
  },

  [ResearchGoal.DEBUGGING]: context => {
    const hints: string[] = [];
    const { responseContext } = context;

    if (context.hasResults) {
      hints.push(
        'Search for related issues and pull requests to understand common problems and their solutions'
      );
      hints.push(
        'Examine commit history to see how similar bugs were fixed in the past'
      );
      hints.push(
        'Look for test cases that demonstrate the expected vs actual behavior'
      );

      if (responseContext?.foundRepositories) {
        hints.push(
          'Check if the same issue appears across multiple projects and how it was resolved'
        );
      }
    } else {
      hints.push(
        'Try searching for error messages, symptoms, or related problem descriptions'
      );
      hints.push(
        'Look for issues in the main project repository or related dependencies'
      );
    }

    return hints;
  },

  [ResearchGoal.CODE_ANALYSIS]: context => {
    const hints: string[] = [];
    const { responseContext } = context;

    if (context.hasResults) {
      hints.push(
        'Examine the complete file structure and dependencies to understand the architecture'
      );
      hints.push(
        'Analyze patterns, conventions, and coding standards used across the codebase'
      );

      if (
        responseContext?.foundLanguages &&
        responseContext.foundLanguages.length > 1
      ) {
        hints.push(
          'Compare implementations across different languages to understand language-specific patterns'
        );
      }
    } else {
      hints.push(
        'Start with repository structure exploration to understand the overall architecture'
      );
      hints.push(
        'Look for documentation that explains the codebase organization and design decisions'
      );
    }

    return hints;
  },

  [ResearchGoal.CODE_REVIEW]: context => {
    const hints: string[] = [];

    if (context.hasResults) {
      hints.push(
        'Look for code quality patterns, testing practices, and documentation standards'
      );
      hints.push(
        'Examine pull request discussions to understand review criteria and common feedback'
      );
      hints.push(
        'Check for security practices, error handling, and performance considerations'
      );
    } else {
      hints.push(
        'Search for contribution guidelines and code review standards in the repository'
      );
      hints.push(
        'Look for examples of well-reviewed pull requests to understand quality expectations'
      );
    }

    return hints;
  },

  [ResearchGoal.CODE_OPTIMIZATION]: context => {
    const hints: string[] = [];

    if (context.hasResults) {
      hints.push(
        'Analyze performance-critical code sections and optimization techniques used'
      );
      hints.push(
        'Look for benchmarks, profiling results, and performance-related discussions'
      );
      hints.push(
        'Examine how similar optimizations were implemented in other projects'
      );
    } else {
      hints.push(
        'Search for performance-related issues, optimizations, and benchmark comparisons'
      );
      hints.push(
        'Look for profiling tools and performance testing approaches used in similar projects'
      );
    }

    return hints;
  },

  [ResearchGoal.CONTEXT_GENERATION]: context => {
    const hints: string[] = [];
    const { responseContext } = context;

    if (context.hasResults) {
      hints.push(
        'Gather comprehensive context from documentation, examples, and real-world usage'
      );
      hints.push(
        'Build understanding of the problem domain, use cases, and solution approaches'
      );

      if (
        responseContext?.foundTopics &&
        responseContext.foundTopics.length > 0
      ) {
        hints.push(
          'Explore related topics and technologies to build comprehensive domain knowledge'
        );
      }
    } else {
      hints.push(
        'Start with official documentation and getting-started guides for foundational context'
      );
      hints.push(
        'Look for tutorials, blog posts, and community discussions for practical insights'
      );
    }

    return hints;
  },

  [ResearchGoal.DOCS_GENERATION]: context => {
    const hints: string[] = [];

    if (context.hasResults) {
      hints.push(
        'Study existing documentation patterns, structure, and writing style'
      );
      hints.push(
        'Look for examples of clear API documentation and usage guides'
      );
      hints.push('Examine how complex concepts are explained and illustrated');
    } else {
      hints.push(
        'Search for well-documented projects in the same domain for inspiration'
      );
      hints.push(
        'Look for documentation tools and templates used by successful projects'
      );
    }

    return hints;
  },

  // Default patterns for less common goals - Fixed circular reference
  [ResearchGoal.ANALYSIS]: context =>
    RESEARCH_GUIDANCE_PATTERNS[ResearchGoal.CODE_ANALYSIS](context),
  [ResearchGoal.EXPLORATION]: context =>
    RESEARCH_GUIDANCE_PATTERNS[ResearchGoal.DISCOVERY](context),
  [ResearchGoal.CODE_REFACTORING]: context => [
    ...RESEARCH_GUIDANCE_PATTERNS[ResearchGoal.CODE_ANALYSIS](context),
    ...RESEARCH_GUIDANCE_PATTERNS[ResearchGoal.CODE_GENERATION](context).slice(
      0,
      1
    ),
  ],
};

// ============================================================================
// TOOL RELATIONSHIP & NAVIGATION PATTERNS
// ============================================================================

/**
 * Strategic tool navigation patterns based on current context and results
 */
export const TOOL_NAVIGATION_PATTERNS: Record<
  ToolName,
  {
    onSuccess: (context: HintGenerationContext) => string[];
    onError: (context: HintGenerationContext, errorType: string) => string[];
    strategic: (context: HintGenerationContext) => string[];
  }
> = {
  [TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES]: {
    onSuccess: context => {
      const hints: string[] = [];
      const repos = context.responseContext?.foundRepositories || [];

      if (repos.length === 1) {
        hints.push(
          'Explore the repository structure to understand its architecture and organization'
        );
        hints.push(
          'Search within this repository for specific implementations and examples'
        );
      } else if (repos.length > 1) {
        hints.push(
          'Compare repository structures and approaches across multiple projects'
        );
        hints.push(
          'Dive deeper into the most relevant repositories for detailed analysis'
        );
      }

      return hints;
    },
    onError: (_context, errorType) => {
      if (errorType === 'no_results') {
        return [
          'Try broader search terms or explore related technologies and frameworks',
          'Use package search to find relevant libraries and their source repositories',
        ];
      }
      return ['Verify search parameters and try alternative search strategies'];
    },
    strategic: () => [
      'Use package search to discover relevant libraries and their repositories',
      'Explore trending repositories in related technologies for inspiration',
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_CODE]: {
    onSuccess: context => {
      const hints: string[] = [];
      const files = context.responseContext?.foundFiles || [];

      if (files.length > 0) {
        hints.push(
          'Examine complete file contents to understand implementation details and context'
        );
        hints.push(
          'Look for related files, tests, and documentation in the same repositories'
        );
      }

      return hints;
    },
    onError: (_context, errorType) => {
      if (errorType === 'no_results') {
        return [
          'Start with repository search to find relevant projects first',
          'Try different search terms or explore related functionality',
        ];
      }
      return ['Adjust search scope or try alternative query approaches'];
    },
    strategic: () => [
      'Search for usage examples and test files to understand practical applications',
      'Explore documentation and README files for comprehensive understanding',
    ],
  },

  [TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE]: {
    onSuccess: () => [
      'Examine key files and directories to understand the project architecture',
      'Look for configuration files, documentation, and entry points',
      'Search within specific directories for targeted code analysis',
    ],
    onError: (_context, errorType) => {
      if (errorType === 'not_found' || errorType === 'access_denied') {
        return [
          'Verify repository name and accessibility',
          'Try searching for similar repositories or alternative projects',
        ];
      }
      return ['Check repository permissions and try different branch names'];
    },
    strategic: () => [
      'Use this structure information to guide more targeted code searches',
      'Identify key directories for focused exploration and analysis',
    ],
  },

  [TOOL_NAMES.GITHUB_FETCH_CONTENT]: {
    onSuccess: () => [
      'Analyze the code structure, patterns, and implementation approaches',
      'Look for related files, imports, and dependencies for complete context',
    ],
    onError: (_context, errorType) => {
      if (errorType === 'not_found') {
        return [
          'Use repository structure exploration to find correct file paths',
          'Search for similar files or alternative implementations',
        ];
      }
      return ['Verify file paths and repository accessibility'];
    },
    strategic: () => [
      'Search for usage examples and test files related to this implementation',
      'Explore similar files in other repositories for comparison',
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_ISSUES]: {
    onSuccess: () => [
      'Examine issue discussions for problem-solving approaches and solutions',
      'Look for related pull requests that address similar concerns',
    ],
    onError: () => [
      'Try broader search terms or search across multiple repositories',
      'Look for discussions in community forums or documentation',
    ],
    strategic: () => [
      'Search for pull requests and commits related to these issues',
      'Explore how similar problems were solved in other projects',
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS]: {
    onSuccess: () => [
      'Review the code changes and discussion to understand implementation approaches',
      'Look for related issues and follow-up pull requests',
    ],
    onError: () => [
      'Search for related issues or commits that might contain relevant information',
      'Try broader search terms or explore different repositories',
    ],
    strategic: () => [
      'Examine the actual code changes to understand implementation details',
      'Look for testing and documentation updates in these pull requests',
    ],
  },

  [TOOL_NAMES.GITHUB_SEARCH_COMMITS]: {
    onSuccess: () => [
      'Examine the commit changes to understand how features were implemented',
      'Look for related commits and the evolution of the codebase',
    ],
    onError: () => [
      'Try searching for related terms or broader time ranges',
      'Look for pull requests or issues that might contain relevant information',
    ],
    strategic: () => [
      'Use commit information to guide more targeted code searches',
      'Explore the repository history for comprehensive understanding',
    ],
  },

  [TOOL_NAMES.PACKAGE_SEARCH]: {
    onSuccess: context => {
      const hints: string[] = [];
      if (context.responseContext?.foundRepositories) {
        hints.push(
          'Explore the source repositories of relevant packages for implementation details'
        );
        hints.push(
          'Compare different packages to understand various approaches and trade-offs'
        );
      }
      return hints;
    },
    onError: () => [
      'Try alternative package names or search for related functionality',
      'Explore different package ecosystems (npm, PyPI) for comprehensive coverage',
    ],
    strategic: () => [
      'Use repository information from packages to guide GitHub exploration',
      'Look for official documentation and usage examples for these packages',
    ],
  },
};

// ============================================================================
// ERROR RECOVERY PATTERNS
// ============================================================================

/**
 * Smart error recovery suggestions based on error type and context
 */
export const ERROR_RECOVERY_PATTERNS: Record<
  string,
  (context: HintGenerationContext) => string[]
> = {
  rate_limit: context => [
    'Wait a few minutes before retrying to respect API rate limits',
    'Use more specific search terms to reduce the number of API calls needed',
    context.queryContext?.searchScope === 'broad'
      ? 'Consider narrowing your search scope with owner/repo filters'
      : 'Try reducing the number of parallel queries',
  ],

  auth_required: () => [
    'Verify your GitHub authentication token is properly configured',
    'Check that your token has the necessary permissions for this resource',
    'Try accessing public resources first to test your connection',
  ],

  not_found: context => {
    const hints = [
      'Verify spelling and check that the resource exists and is accessible',
      'Try broader search terms or remove specific filters',
    ];

    if (context.queryContext?.owner && context.queryContext?.repo) {
      const repoRef = `${context.queryContext.owner}/${context.queryContext.repo}`;
      hints.push(
        `Confirm that repository ${repoRef} exists and is publicly accessible`
      );
    }

    return hints;
  },

  access_denied: () => [
    'This resource may be private or require special permissions',
    'Try searching in public repositories or verify your access rights',
    'Look for similar functionality in publicly accessible projects',
  ],

  network: () => [
    'Check your internet connection and retry the request',
    'This may be a temporary issue - try again in a few moments',
    'Consider reducing query complexity if the problem persists',
  ],

  validation: context => {
    const hints = [
      'Review your query parameters for correctness and completeness',
    ];

    if (context.queryContext?.queryTerms?.length === 0) {
      hints.push('Ensure you provide valid search terms in your query');
    }

    return hints;
  },

  no_results: context => {
    const hints = [
      'Try broader, more general search terms',
      'Remove specific filters to expand your search scope',
      'Consider alternative keywords or related terminology',
    ];

    // Add semantic alternatives if available
    const semanticTerms = getSemanticAlternatives(context.researchGoal);
    if (semanticTerms.length > 0) {
      hints.push(
        `Try these related terms: ${semanticTerms.slice(0, 3).join(', ')}`
      );
    }

    return hints;
  },
};

// ============================================================================
// CONTEXTUAL INSIGHT PATTERNS
// ============================================================================

/**
 * Generate insights based on response data patterns
 */
export function generateContextualInsights(
  context: HintGenerationContext
): string[] {
  const insights: string[] = [];
  const { responseContext, queryContext } = context;

  if (!responseContext || !context.hasResults) return insights;

  // Repository diversity insights
  if (responseContext.foundRepositories) {
    const repoCount = responseContext.foundRepositories.length;
    if (repoCount === 1) {
      insights.push(
        'Focus on this single repository for deep, comprehensive analysis'
      );
    } else if (repoCount > 5) {
      insights.push(
        `Found ${repoCount} repositories - consider comparing the most popular or recent ones first`
      );
    } else if (repoCount > 1) {
      insights.push(
        `Compare approaches across these ${repoCount} repositories to identify best practices`
      );
    }
  }

  // Language diversity insights
  if (
    responseContext.foundLanguages &&
    responseContext.foundLanguages.length > 1
  ) {
    insights.push(
      `Multiple languages found (${responseContext.foundLanguages.join(', ')}) - compare language-specific patterns`
    );
  }

  // Data quality insights
  if (responseContext.dataQuality) {
    if (responseContext.dataQuality.hasPopularResults) {
      insights.push(
        'Found popular/well-maintained projects - prioritize these for reliable patterns'
      );
    }
    if (responseContext.dataQuality.hasMatches && responseContext.foundFiles) {
      insights.push(
        'Examine the specific code matches to understand implementation details'
      );
    }
  }

  // Search scope recommendations
  if (
    queryContext?.searchScope === 'broad' &&
    context.totalItems &&
    context.totalItems > 20
  ) {
    insights.push(
      'Consider narrowing your search focus for more targeted analysis'
    );
  } else if (
    queryContext?.searchScope === 'focused' &&
    context.totalItems &&
    context.totalItems < 5
  ) {
    insights.push(
      'Consider broadening your search to discover more alternatives and approaches'
    );
  }

  return insights;
}

// ============================================================================
// HINT PRIORITIZATION & MERGING
// ============================================================================

const PRIORITY_WEIGHTS = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
};

const CATEGORY_WEIGHTS = {
  error_recovery: 1.2,
  strategic_navigation: 1.0,
  research_guidance: 0.9,
  contextual_insight: 0.8,
};

/**
 * Intelligently merge and prioritize hints from multiple sources
 */
export function mergeAndPrioritizeHints(
  hints: PrioritizedHint[],
  maxHints: number = 8
): string[] {
  // Remove duplicates based on content similarity
  const uniqueHints = removeSimilarHints(hints);

  // Calculate weighted scores
  const scoredHints = uniqueHints.map(hint => ({
    ...hint,
    score:
      PRIORITY_WEIGHTS[hint.priority] *
      CATEGORY_WEIGHTS[hint.category] *
      hint.confidence,
  }));

  // Sort by score and take top hints
  return scoredHints
    .sort((a, b) => b.score - a.score)
    .slice(0, maxHints)
    .map(hint => hint.content);
}

/**
 * Remove hints that are too similar to avoid redundancy
 */
function removeSimilarHints(hints: PrioritizedHint[]): PrioritizedHint[] {
  const unique: PrioritizedHint[] = [];

  for (const hint of hints) {
    const isSimilar = unique.some(
      existing => calculateSimilarity(hint.content, existing.content) > 0.7
    );

    if (!isSimilar) {
      unique.push(hint);
    } else {
      // Keep the higher priority/confidence hint
      const existingIndex = unique.findIndex(
        existing => calculateSimilarity(hint.content, existing.content) > 0.7
      );

      if (existingIndex >= 0) {
        const existing = unique[existingIndex];
        const hintScore = PRIORITY_WEIGHTS[hint.priority] * hint.confidence;
        const existingScore =
          PRIORITY_WEIGHTS[existing.priority] * existing.confidence;

        if (hintScore > existingScore) {
          unique[existingIndex] = hint;
        }
      }
    }
  }

  return unique;
}

/**
 * Calculate similarity between two hint strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);

  const intersection = words1.filter(word => words2.includes(word));
  const union = [...new Set([...words1, ...words2])];

  return intersection.length / union.length;
}

// ============================================================================
// MAIN HINT GENERATION FUNCTION
// ============================================================================

/**
 * Generate comprehensive, intelligent hints for any tool context
 *
 * This is the main entry point that orchestrates all hint generation systems
 */
export function generateIntelligentHints(
  context: HintGenerationContext
): HintGenerationResult {
  const allHints: PrioritizedHint[] = [];

  // 1. Error Recovery Hints (Highest Priority)
  if (context.errorMessage) {
    const errorContext = extractErrorContext(context.errorMessage);
    const recoveryHints =
      ERROR_RECOVERY_PATTERNS[errorContext.type]?.(context) ||
      ERROR_RECOVERY_PATTERNS.validation(context);

    recoveryHints.forEach(hint => {
      allHints.push({
        content: hint,
        priority: 'critical',
        category: 'error_recovery',
        confidence: 0.9,
        source: 'error_analysis',
      });
    });
  }

  // 2. Tool Navigation Hints
  const toolPatterns = TOOL_NAVIGATION_PATTERNS[context.toolName];
  if (toolPatterns) {
    let navigationHints: string[] = [];

    if (context.errorMessage) {
      const errorContext = extractErrorContext(context.errorMessage);
      navigationHints = toolPatterns.onError(context, errorContext.type);
    } else if (context.hasResults) {
      navigationHints = toolPatterns.onSuccess(context);
    }

    // Add strategic hints
    navigationHints.push(...toolPatterns.strategic(context));

    navigationHints.forEach(hint => {
      allHints.push({
        content: hint,
        priority: context.hasResults ? 'high' : 'medium',
        category: 'strategic_navigation',
        confidence: 0.8,
        source: 'tool_relationships',
      });
    });
  }

  // 3. Research Guidance Hints
  if (context.researchGoal && context.hasResults) {
    const researchGoal = context.researchGoal as ResearchGoal;
    const guidancePattern = RESEARCH_GUIDANCE_PATTERNS[researchGoal];

    if (guidancePattern) {
      const guidanceHints = guidancePattern(context);

      guidanceHints.forEach(hint => {
        allHints.push({
          content: hint,
          priority: 'high',
          category: 'research_guidance',
          confidence: 0.85,
          source: 'research_goals',
        });
      });
    }
  }

  // 4. Contextual Insights
  const contextualHints = generateContextualInsights(context);
  contextualHints.forEach(hint => {
    allHints.push({
      content: hint,
      priority: 'medium',
      category: 'contextual_insight',
      confidence: 0.7,
      source: 'response_data',
    });
  });

  // 5. Custom Hints (from tool-specific logic)
  if (context.customHints) {
    context.customHints.forEach(hint => {
      allHints.push({
        content: hint,
        priority: 'medium',
        category: 'contextual_insight',
        confidence: 0.75,
        source: 'response_data',
      });
    });
  }

  // Merge and prioritize all hints
  const finalHints = mergeAndPrioritizeHints(allHints);

  // Determine research phase
  const researchPhase = determineResearchPhase(context);

  // Calculate metadata
  const priorityBreakdown = allHints.reduce(
    (acc, hint) => {
      acc[hint.priority] = (acc[hint.priority] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const sources = [...new Set(allHints.map(hint => hint.source))];

  return {
    hints: finalHints,
    metadata: {
      totalGenerated: allHints.length,
      priorityBreakdown,
      sources,
      researchPhase,
    },
  };
}

/**
 * Determine the current research phase based on context
 */
function determineResearchPhase(
  context: HintGenerationContext
): 'discovery' | 'analysis' | 'deep_dive' | 'synthesis' {
  if (context.errorMessage || !context.hasResults) {
    return 'discovery';
  }

  if (context.totalItems && context.totalItems > 10) {
    return 'analysis';
  }

  if (context.responseContext?.dataQuality?.hasContent) {
    return 'deep_dive';
  }

  if (context.previousTools && context.previousTools.length > 2) {
    return 'synthesis';
  }

  return 'analysis';
}

// ============================================================================
// CONVENIENCE FUNCTIONS FOR TOOLS
// ============================================================================

/**
 * Simple helper for tools to generate hints with minimal setup
 */
export function generateToolHints(
  toolName: ToolName,
  options: {
    hasResults?: boolean;
    totalItems?: number;
    errorMessage?: string;
    customHints?: string[];
    researchGoal?: ResearchGoal | string;
    queryContext?: HintGenerationContext['queryContext'];
    responseContext?: HintGenerationContext['responseContext'];
    previousTools?: ToolName[];
  }
): string[] {
  const context: HintGenerationContext = {
    toolName,
    hasResults: options.hasResults ?? (options.totalItems || 0) > 0,
    totalItems: options.totalItems,
    errorMessage: options.errorMessage,
    customHints: options.customHints,
    researchGoal: options.researchGoal,
    queryContext: options.queryContext,
    responseContext: options.responseContext,
    previousTools: options.previousTools,
  };

  const result = generateIntelligentHints(context);
  return result.hints;
}

/**
 * Generate hints for bulk operations with aggregated context
 */
export function generateBulkOperationHints<T extends { researchGoal?: string }>(
  toolName: ToolName,
  results: Array<{ success: boolean; data?: unknown; error?: string }>,
  queries: T[],
  aggregatedContext?: HintGenerationContext['responseContext']
): string[] {
  const successfulResults = results.filter(r => r.success);
  const failedResults = results.filter(r => !r.success);

  const context: HintGenerationContext = {
    toolName,
    hasResults: successfulResults.length > 0,
    totalItems: successfulResults.length,
    errorMessage:
      failedResults.length > 0
        ? `${failedResults.length} queries failed`
        : undefined,
    researchGoal: queries.find(q => q.researchGoal)
      ?.researchGoal as ResearchGoal,
    responseContext: aggregatedContext,
    customHints:
      failedResults.length > 0
        ? [
            `${failedResults.length} of ${results.length} queries failed - check individual results for specific errors`,
          ]
        : undefined,
  };

  const result = generateIntelligentHints(context);
  return result.hints;
}

/**
 * Legacy compatibility function
 */
export function generateSmartHints(
  toolName: ToolName,
  results: {
    hasResults?: boolean;
    totalItems?: number;
    errorMessage?: string;
    customHints?: string[];
    researchGoal?: string;
  },
  previousTools?: ToolName[]
): string[] {
  return generateToolHints(toolName, {
    ...results,
    previousTools,
  });
}

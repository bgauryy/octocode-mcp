import { TOOL_NAMES, ToolName } from '../constants';

export interface HintContext {
  toolName: ToolName;
  hasResults?: boolean;
  totalItems?: number;
  errorMessage?: string;
  customHints?: string[];
  queryContext?: {
    owner?: string | string[];
    repo?: string | string[];
    keywordsToSearch?: string[];
    language?: string;
  };
}

export interface BulkHintContext {
  toolName: ToolName;
  hasResults: boolean;
  errorCount: number;
  totalCount: number;
  successCount: number;
}

const ERROR_RECOVERY_HINTS = {
  RATE_LIMIT: 'Rate limit exceeded. Wait 60 seconds before retrying',
  AUTH_REQUIRED:
    'Authentication required. Check your GitHub token configuration',
  NETWORK_ERROR: 'Network error. Check connection and retry',
  INVALID_PARAMS: 'Invalid parameters. Review your query format',
  NOT_FOUND: 'Resource not found. Verify spelling and accessibility',
  ACCESS_DENIED: 'Access denied. Check permissions or try public repositories',
  EMPTY_QUERIES: 'Queries array is required and cannot be empty',
  VALIDATION_FAILED: 'Validation failed. Check parameter types and constraints',
  USE_SPECIFIC_TERMS: 'Use more specific search terms to reduce API calls',
  NARROW_SCOPE: 'Consider adding owner/repo filters to narrow search scope',
  REMOVE_FILTERS: 'Remove specific filters to discover more alternatives',
  PUBLIC_REPOS: 'Search in public repositories if private access is denied',
  BROADER_TERMS: 'Try broader search terms to expand your search scope',
  SEMANTIC_ALTERNATIVES: 'Use semantic alternatives or related terminology',
  // Package search specific
  PACKAGE_NOT_FOUND: 'Package not found. Try alternative names or spellings',
  CHECK_NPM_REGISTRY:
    'For NPM: Check package availability on https://npmjs.com',
  CHECK_PYPI_REGISTRY: 'For Python: Check exact spelling on https://pypi.org',
  USE_FUNCTIONAL_TERMS:
    'Try broader functional terms that describe what the code does rather than specific tool names',
  SIMPLIFY_PACKAGE_NAMES:
    'Use core concept keywords instead of compound library-specific names',
} as const;

const TOOL_NAVIGATION_HINTS = {
  FETCH_CONTENT:
    'Use github_fetch_content with matchString from search results for precise context extraction',
  VIEW_STRUCTURE:
    'Use github_view_repo_structure first to understand project layout, then target specific files',
  COMPARE_APPROACHES:
    'Compare implementations across 3-5 repositories to identify best practices',
  LOOK_FOR_DOCS:
    'Prioritize documentation in this order: README files, docs folders, examples, then verify against implementation',
  EXAMINE_TESTS:
    'Test files reveal real usage patterns - look for test directories to understand practical examples',
  ANALYZE_PATTERNS:
    'Look for: naming conventions, file structure, error handling, and configuration patterns',
  STRATEGIC_CHAINING:
    'Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis',
  // Quality-focused research hints
  IMPLEMENTATION_FIRST:
    'Focus on implementation files in relevant languages for accurate code understanding',
  VERIFY_DOCS:
    'Always verify documentation claims against actual implementation code',
  FIND_ENTRY_POINTS:
    'Look for main files, index files, and public APIs to understand code structure',
  DISCOVER_RELATED:
    'From implementation files, find: imports, exports, tests, and related modules',
  AVOID_SPECULATION:
    'Only report what exists in actual code - no assumptions or hallucinations',
  QUALITY_VERIFICATION:
    'Cross-reference documentation with implementation to ensure accuracy',
  IMPLEMENTATION_TRUTH:
    'Trust implementation over documentation when they conflict',
  // Repository search specific hints
  USE_TOPICS_FOR_EXPLORATION:
    'Topics for ecosystem discovery: combine technology type with domain area for broad exploration',
  USE_QUERY_TERMS_FOR_SPECIFIC:
    'QueryTerms for exact matches: use descriptive phrases that capture the specific functionality you need',
  BULK_QUERIES:
    'Use multiple queries in one call: broad discovery + specific patterns + error cases',
  // Commits/PRs guidance
  COMMITS_PRS_ON_REQUEST:
    'Use commit/PR search only when explicitly requested - focus on implementation files',
} as const;

const NO_RESULTS_HINTS = {
  BROADER_TERMS:
    'No results found. Try broader search terms or related concepts',
  START_WITH_REPOS:
    'Start with repository search to find relevant projects, then search within promising repos',
  DIFFERENT_TERMS:
    'Try semantic alternatives: expand abbreviations, use synonyms, or try related conceptual terms',
  ALTERNATIVE_KEYWORDS:
    'Use functional descriptions that focus on what the code accomplishes rather than specific library names',
  EXPAND_SCOPE:
    'Remove owner/repo/language filters to discover more alternatives',
  WORKING_EXAMPLES:
    'Search for working examples in popular repositories using broader terms',
  OFFICIAL_DOCS:
    'Look for README files, documentation folders, and getting-started guides',
  ERROR_MESSAGES:
    'Search for error patterns, common issues, and troubleshooting discussions',
  PROJECT_ISSUES:
    'Use GitHub issues search to find real-world usage patterns and solutions',
  RELATED_TECH:
    'Explore ecosystem: consider frameworks, libraries, and tools commonly used with your target technology',
  PACKAGE_DISCOVERY:
    'Use package search to find libraries, then explore their GitHub repositories',
  PROGRESSIVE_SEARCH:
    'Start with core concepts, then progressively narrow to specific implementations and tools',
} as const;

function extractErrorContext(errorMessage: string): {
  type:
    | 'rate_limit'
    | 'auth'
    | 'network'
    | 'validation'
    | 'not_found'
    | 'access_denied'
    | 'package_not_found'
    | 'unknown';
  isRecoverable: boolean;
} {
  const error = errorMessage.toLowerCase();

  if (error.includes('rate limit') || error.includes('too many requests')) {
    return { type: 'rate_limit', isRecoverable: true };
  }
  if (
    error.includes('auth') ||
    error.includes('token') ||
    error.includes('unauthorized')
  ) {
    return { type: 'auth', isRecoverable: true };
  }
  if (
    error.includes('network') ||
    error.includes('connection') ||
    error.includes('timeout')
  ) {
    return { type: 'network', isRecoverable: true };
  }
  if (
    error.includes('validation') ||
    error.includes('invalid') ||
    error.includes('required')
  ) {
    return { type: 'validation', isRecoverable: true };
  }
  if (error.includes('not found') || error.includes('404')) {
    return { type: 'not_found', isRecoverable: true };
  }
  if (
    error.includes('package') &&
    (error.includes('not found') || error.includes('no packages found'))
  ) {
    return { type: 'package_not_found', isRecoverable: true };
  }
  if (
    error.includes('access denied') ||
    error.includes('forbidden') ||
    error.includes('403')
  ) {
    return { type: 'access_denied', isRecoverable: true };
  }

  return { type: 'unknown', isRecoverable: false };
}

function generateErrorRecoveryHints(errorMessage: string): string[] {
  const errorContext = extractErrorContext(errorMessage);
  const hints: string[] = [];

  switch (errorContext.type) {
    case 'rate_limit':
      hints.push(ERROR_RECOVERY_HINTS.RATE_LIMIT);
      hints.push(ERROR_RECOVERY_HINTS.USE_SPECIFIC_TERMS);
      hints.push(ERROR_RECOVERY_HINTS.NARROW_SCOPE);
      break;

    case 'auth':
      hints.push(ERROR_RECOVERY_HINTS.AUTH_REQUIRED);
      break;

    case 'network':
      hints.push(ERROR_RECOVERY_HINTS.NETWORK_ERROR);
      hints.push('Check your internet connection and retry the request');
      break;

    case 'validation':
      hints.push(ERROR_RECOVERY_HINTS.VALIDATION_FAILED);
      hints.push(ERROR_RECOVERY_HINTS.INVALID_PARAMS);
      break;

    case 'not_found':
      hints.push(ERROR_RECOVERY_HINTS.NOT_FOUND);
      hints.push(ERROR_RECOVERY_HINTS.BROADER_TERMS);
      break;

    case 'access_denied':
      hints.push(ERROR_RECOVERY_HINTS.ACCESS_DENIED);
      hints.push(ERROR_RECOVERY_HINTS.PUBLIC_REPOS);
      break;

    case 'package_not_found':
      hints.push(ERROR_RECOVERY_HINTS.PACKAGE_NOT_FOUND);
      hints.push(ERROR_RECOVERY_HINTS.USE_FUNCTIONAL_TERMS);
      hints.push(ERROR_RECOVERY_HINTS.SIMPLIFY_PACKAGE_NAMES);
      hints.push(ERROR_RECOVERY_HINTS.CHECK_NPM_REGISTRY);
      hints.push(ERROR_RECOVERY_HINTS.CHECK_PYPI_REGISTRY);
      break;

    default:
      hints.push(ERROR_RECOVERY_HINTS.BROADER_TERMS);
      hints.push(ERROR_RECOVERY_HINTS.REMOVE_FILTERS);
  }

  return hints;
}

function generateToolNavigationHints(
  toolName: ToolName,
  hasResults: boolean,
  totalItems?: number
): string[] {
  const hints: string[] = [];

  switch (toolName) {
    case TOOL_NAMES.GITHUB_SEARCH_CODE:
      if (hasResults) {
        hints.push(TOOL_NAVIGATION_HINTS.FETCH_CONTENT);
        hints.push(TOOL_NAVIGATION_HINTS.STRATEGIC_CHAINING);
        if (totalItems && totalItems > 15) {
          hints.push(
            'Refine with owner/repo filters or specific file extensions'
          );
        } else if (totalItems && totalItems > 5) {
          hints.push('Consider language or path filters to focus results');
        }
      } else {
        hints.push(NO_RESULTS_HINTS.START_WITH_REPOS);
        hints.push(NO_RESULTS_HINTS.PROGRESSIVE_SEARCH);
        hints.push(NO_RESULTS_HINTS.DIFFERENT_TERMS);
        hints.push(TOOL_NAVIGATION_HINTS.LOOK_FOR_DOCS);
        hints.push(TOOL_NAVIGATION_HINTS.IMPLEMENTATION_FIRST);
      }
      break;

    case TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES:
      if (hasResults) {
        hints.push(TOOL_NAVIGATION_HINTS.VIEW_STRUCTURE);
        hints.push(TOOL_NAVIGATION_HINTS.COMPARE_APPROACHES);
        if (totalItems && totalItems > 10) {
          hints.push(
            'Sort by stars and focus on top 3-5 repositories for analysis'
          );
        } else if (totalItems && totalItems > 3) {
          hints.push('Explore structure of most popular repositories first');
        }
      } else {
        hints.push(
          'Try broader search terms or use topicsToSearch for discovery'
        );
        hints.push(TOOL_NAVIGATION_HINTS.USE_TOPICS_FOR_EXPLORATION);
        hints.push(NO_RESULTS_HINTS.PACKAGE_DISCOVERY);
        hints.push(NO_RESULTS_HINTS.RELATED_TECH);
        hints.push(NO_RESULTS_HINTS.ALTERNATIVE_KEYWORDS);
      }
      break;

    case TOOL_NAMES.GITHUB_FETCH_CONTENT:
      if (hasResults) {
        hints.push(TOOL_NAVIGATION_HINTS.DISCOVER_RELATED);
        hints.push(TOOL_NAVIGATION_HINTS.VERIFY_DOCS);
        hints.push(TOOL_NAVIGATION_HINTS.FIND_ENTRY_POINTS);
        hints.push(
          'Examine imports/exports to understand dependencies and usage'
        );
      } else {
        hints.push(TOOL_NAVIGATION_HINTS.VIEW_STRUCTURE);
        hints.push(
          'Check branch name (main/master) and verify file path exists'
        );
        hints.push(TOOL_NAVIGATION_HINTS.IMPLEMENTATION_FIRST);
      }
      break;

    case TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE:
      if (hasResults) {
        hints.push(TOOL_NAVIGATION_HINTS.FETCH_CONTENT);
        hints.push(TOOL_NAVIGATION_HINTS.ANALYZE_PATTERNS);
        hints.push(
          'Focus on source code and example directories for implementation details'
        );
      } else {
        hints.push(
          'Try different branch names: main, master, develop, or default'
        );
        hints.push('Verify repository access and spelling of owner/repo names');
      }
      break;

    case TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS:
      if (hasResults) {
        hints.push(TOOL_NAVIGATION_HINTS.COMMITS_PRS_ON_REQUEST);
        hints.push(
          'Focus on code changes rather than PR discussions for implementation details'
        );
      } else {
        hints.push(
          'Consider if commit/PR search is necessary for your research goal'
        );
        hints.push(TOOL_NAVIGATION_HINTS.IMPLEMENTATION_FIRST);
      }
      break;
  }

  return hints;
}

export function generateHints(context: HintContext): string[] {
  const hints: string[] = [];

  // Add custom hints first (user-provided)
  if (context.customHints) {
    hints.push(...context.customHints);
  }

  // Generate error recovery hints if there's an error
  if (context.errorMessage) {
    hints.push(...generateErrorRecoveryHints(context.errorMessage));
  }

  // Generate tool-specific navigation hints
  hints.push(
    ...generateToolNavigationHints(
      context.toolName,
      context.hasResults || false,
      context.totalItems
    )
  );

  // Add smart no-results guidance if no results and no error
  if (!context.hasResults && !context.errorMessage) {
    hints.push(NO_RESULTS_HINTS.BROADER_TERMS);
    hints.push(NO_RESULTS_HINTS.START_WITH_REPOS);
    hints.push(NO_RESULTS_HINTS.PROGRESSIVE_SEARCH);
    hints.push(TOOL_NAVIGATION_HINTS.IMPLEMENTATION_FIRST);

    // Add context-specific fallback suggestions
    if (context.queryContext?.language) {
      hints.push(
        `Focus on ${context.queryContext.language} implementation files rather than documentation`
      );
    }
    if (context.queryContext?.owner && context.queryContext?.repo) {
      hints.push(
        `Use structure view to find main implementation files in ${context.queryContext.owner}/${context.queryContext.repo}`
      );
    }
  }

  // Deduplicate and limit hints (max 6 for optimal LLM processing)
  const uniqueHints = [
    ...new Set(hints.filter(hint => hint && typeof hint === 'string')),
  ];
  return uniqueHints.slice(0, 6);
}

export function generateBulkHints(context: BulkHintContext): string[] {
  const hints: string[] = [];

  if (context.hasResults) {
    // Success analysis with actionable guidance
    if (context.errorCount > 0) {
      const successRate = Math.round(
        (context.successCount / context.totalCount) * 100
      );
      hints.push(
        `${context.successCount}/${context.totalCount} queries succeeded (${successRate}%)`
      );
      hints.push(
        'Review failed queries for pattern adjustments and retry strategies'
      );
    }

    if (context.successCount > 3) {
      hints.push(
        'Rich dataset available - analyze patterns, compare implementations, identify best practices'
      );
      hints.push(TOOL_NAVIGATION_HINTS.COMPARE_APPROACHES);
    } else if (context.successCount > 1) {
      hints.push(
        'Multiple results found - cross-reference approaches and look for common patterns'
      );
      hints.push(TOOL_NAVIGATION_HINTS.STRATEGIC_CHAINING);
    } else if (context.successCount === 1) {
      hints.push(
        'Single result found - dive deep and look for related examples in the same repository'
      );
      hints.push(
        'Use repository structure analysis to find similar implementations'
      );
    }
  } else {
    // Smart failure analysis and recovery
    hints.push(
      `All ${context.totalCount} queries returned no results - try broader research strategy`
    );
    hints.push(NO_RESULTS_HINTS.START_WITH_REPOS);
    hints.push(NO_RESULTS_HINTS.PACKAGE_DISCOVERY);
    hints.push('Break down into smaller, more focused searches');
  }

  // Add contextual tool-specific guidance
  hints.push(
    ...generateToolNavigationHints(context.toolName, context.hasResults)
  );

  // Intelligent hint prioritization and deduplication
  const uniqueHints = [
    ...new Set(hints.filter(hint => hint && typeof hint === 'string')),
  ];

  // Prioritize actionable hints over generic ones
  const prioritizedHints = uniqueHints.sort((a, b) => {
    const actionWords = [
      'use',
      'try',
      'search',
      'explore',
      'compare',
      'analyze',
    ];
    const aHasAction = actionWords.some(word => a.toLowerCase().includes(word));
    const bHasAction = actionWords.some(word => b.toLowerCase().includes(word));

    if (aHasAction && !bHasAction) return -1;
    if (!aHasAction && bHasAction) return 1;
    return 0;
  });

  return prioritizedHints.slice(0, 6);
}

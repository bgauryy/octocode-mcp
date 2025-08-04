/**
 * Standardized smart suggestion generation for GitHub tools
 * Provides consistent error recovery and query enhancement across all tools
 */

import { ToolName } from './toolConstants';
import {
  ErrorContext,
  extractErrorContext,
  getSemanticAlternatives,
  parseRepositoryReference,
} from './queryUtils';

/**
 * Base interface for all query types
 */
interface BaseQuery {
  id?: string;
  researchGoal?: string;
  queryTerms?: string[];
  owner?: string | string[] | null;
  repo?: string | string[] | null;
}

/**
 * Standard smart suggestion response structure
 */
export interface SmartSuggestionResponse {
  hints: string[];
  searchType: 'no_results' | 'api_error' | 'validation_error';
  suggestions: {
    broaderSearch?: string[];
    semanticAlternatives?: string[];
    splitQueries?: any[];
    alternativeApproaches?: string[];
    recoveryActions?: string[];
  };
  errorContext: ErrorContext;
}

/**
 * Tool-specific suggestion customization
 */
export interface ToolSuggestionConfig {
  toolName: ToolName;
  supportsOwnerRepo: boolean;
  supportsQueryTerms: boolean;
  supportsLanguage: boolean;
  defaultSplitStrategy:
    | 'individual_terms'
    | 'simplified_params'
    | 'alternative_filters';
}

/**
 * Generate smart suggestions for any GitHub tool
 */
export function generateSmartSuggestions<T extends BaseQuery>(
  config: ToolSuggestionConfig,
  error: string,
  query: T,
  customSuggestions?: Partial<SmartSuggestionResponse['suggestions']>
): SmartSuggestionResponse {
  const errorContext = extractErrorContext(error);
  const hints: string[] = [];
  const suggestions: SmartSuggestionResponse['suggestions'] = {
    ...customSuggestions,
  };

  // Determine search type based on error
  let searchType: SmartSuggestionResponse['searchType'];

  switch (errorContext.type) {
    case 'rate_limit':
      searchType = 'api_error';
      hints.push('Rate limited - wait a few minutes before retrying');
      hints.push('Use more specific search terms to reduce API calls');
      if (config.supportsOwnerRepo) {
        hints.push('Consider adding owner/repo filters to narrow search scope');
      }

      suggestions.recoveryActions = [
        'Wait 60 seconds before retrying',
        'Use more specific search terms',
        'Reduce the number of parallel queries',
      ];
      break;

    case 'not_found':
    case 'access_denied':
      searchType = 'api_error';
      hints.push('Resource may be private, non-existent, or access restricted');
      hints.push('Check spelling and accessibility');

      if (config.supportsOwnerRepo && (query.owner || query.repo)) {
        suggestions.broaderSearch = [
          'Remove owner/repo filters to search more broadly',
          'Try searching in public repositories only',
          'Verify repository names and permissions',
        ];
      }

      suggestions.alternativeApproaches = [
        'Try different keywords or search terms',
        'Search for similar functionality in other repositories',
        'Use package search to find related projects first',
      ];
      break;

    case 'network':
      searchType = 'api_error';
      hints.push('Network issue - retry the same query');
      hints.push('Try reducing query complexity');

      suggestions.recoveryActions = [
        'Retry the exact same query',
        'Check internet connection',
        'Reduce query scope if the issue persists',
      ];
      break;

    case 'validation':
      searchType = 'validation_error';
      hints.push('Check query syntax and required parameters');
      if (config.supportsQueryTerms) {
        hints.push('Ensure queryTerms array is not empty if provided');
      }

      suggestions.recoveryActions = [
        'Verify all required parameters are provided',
        'Check parameter formats and constraints',
        'Simplify query structure',
      ];
      break;

    case 'auth_required':
      searchType = 'api_error';
      hints.push('Authentication required - check GitHub token configuration');

      suggestions.recoveryActions = [
        'Verify GitHub token is properly configured',
        'Check token permissions for the requested resource',
        'Try accessing public resources first',
      ];
      break;

    default:
      // Assume no results found
      searchType = 'no_results';
      generateNoResultsSuggestions(config, query, hints, suggestions);
      break;
  }

  return {
    hints,
    searchType,
    suggestions,
    errorContext,
  };
}

/**
 * Generate suggestions for no results scenarios
 */
function generateNoResultsSuggestions<T extends BaseQuery>(
  config: ToolSuggestionConfig,
  query: T,
  hints: string[],
  suggestions: SmartSuggestionResponse['suggestions']
): void {
  hints.push('Try broader terms, individual keywords, or remove filters');

  if (
    config.supportsQueryTerms &&
    query.queryTerms &&
    query.queryTerms.length > 1
  ) {
    suggestions.broaderSearch = [
      'Try individual terms',
      'Use general keywords',
      'Remove filters',
    ];

    // Create split queries for each term
    if (config.defaultSplitStrategy === 'individual_terms') {
      suggestions.splitQueries = query.queryTerms.map((term, index) => ({
        ...query,
        id: `${query.id || 'split'}-${index + 1}`,
        queryTerms: [term],
      }));
    }
  }

  // Generate semantic alternatives based on research goal
  const semanticTerms = getSemanticAlternatives(query.researchGoal);
  if (semanticTerms.length > 0) {
    suggestions.semanticAlternatives = semanticTerms;
  }

  // Tool-specific suggestions
  generateToolSpecificSuggestions(config, query, suggestions);

  // Common recovery strategies
  suggestions.alternativeApproaches = [
    'Use broader terms',
    'Try semantic alternatives',
    'Remove filters',
    'Use related tools',
  ];

  hints.push(
    '→ Broader terms',
    '→ Semantic alternatives',
    '→ Remove filters',
    '→ Alternative approaches'
  );
}

/**
 * Generate tool-specific suggestions based on the tool's capabilities
 */
function generateToolSpecificSuggestions<T extends BaseQuery>(
  config: ToolSuggestionConfig,
  _query: T,
  suggestions: SmartSuggestionResponse['suggestions']
): void {
  const alternativeApproaches = suggestions.alternativeApproaches || [];

  switch (config.toolName) {
    case 'githubSearchRepositories':
      alternativeApproaches.push(
        'Use package_search to find related packages first',
        'Search by topic or language instead of keywords',
        'Try searching for "awesome" lists in the topic area'
      );
      break;

    case 'githubSearchCode':
      alternativeApproaches.push(
        'Start with repository search to find relevant projects',
        'Use file extension filters to narrow down results',
        'Search for usage examples in documentation'
      );
      break;

    case 'githubViewRepoStructure':
      alternativeApproaches.push(
        'Verify repository exists with repository search first',
        'Try different branch names (main, master, develop)',
        'Start with root directory exploration'
      );
      break;

    case 'githubGetFileContent':
      alternativeApproaches.push(
        'Use repository structure view to find correct file paths',
        'Search for file content using code search first',
        'Try alternative file extensions or naming patterns'
      );
      break;

    default:
      // Generic suggestions for other tools
      alternativeApproaches.push(
        'Try related GitHub tools for different perspectives',
        'Use package search for dependency-related queries'
      );
      break;
  }

  suggestions.alternativeApproaches = alternativeApproaches;
}

/**
 * Generate recovery actions based on specific query patterns
 */
export function generateRecoveryActions<T extends BaseQuery>(
  config: ToolSuggestionConfig,
  query: T,
  errorContext: ErrorContext
): string[] {
  const actions: string[] = [];

  // Error-specific recovery actions
  if (errorContext.isRetryable) {
    actions.push('Retry the query after a brief delay');
  }

  // Query-specific recovery actions
  if (config.supportsOwnerRepo && query.owner) {
    actions.push('Try removing owner filter to search more broadly');
  }

  if (
    config.supportsQueryTerms &&
    query.queryTerms &&
    query.queryTerms.length > 1
  ) {
    actions.push('Try searching for individual terms separately');
  }

  // Repository-specific recovery
  if (query.owner && query.repo) {
    const repoInfo = parseRepositoryReference(`${query.owner}/${query.repo}`);
    if (repoInfo) {
      actions.push(`Verify that ${repoInfo.fullName} exists and is accessible`);
    }
  }

  // General recovery actions
  actions.push('Use more general search terms');
  actions.push('Consider alternative research approaches');

  return actions;
}

/**
 * Create tool-specific suggestion configurations
 */
export const TOOL_SUGGESTION_CONFIGS: Record<string, ToolSuggestionConfig> = {
  github_search_repositories: {
    toolName: 'githubSearchRepositories',
    supportsOwnerRepo: true,
    supportsQueryTerms: true,
    supportsLanguage: true,
    defaultSplitStrategy: 'individual_terms',
  },
  github_search_code: {
    toolName: 'githubSearchCode',
    supportsOwnerRepo: true,
    supportsQueryTerms: true,
    supportsLanguage: true,
    defaultSplitStrategy: 'individual_terms',
  },
  github_view_repo_structure: {
    toolName: 'githubViewRepoStructure',
    supportsOwnerRepo: true,
    supportsQueryTerms: false,
    supportsLanguage: false,
    defaultSplitStrategy: 'alternative_filters',
  },
  github_fetch_content: {
    toolName: 'githubGetFileContent',
    supportsOwnerRepo: true,
    supportsQueryTerms: false,
    supportsLanguage: false,
    defaultSplitStrategy: 'simplified_params',
  },
  package_search: {
    toolName: 'packageSearch',
    supportsOwnerRepo: false,
    supportsQueryTerms: false,
    supportsLanguage: false,
    defaultSplitStrategy: 'simplified_params',
  },
};

/**
 * Unified LLM Research Guidance System
 * Provides concise, actionable guidance for code research and debugging
 */

import { GITHUB_SEARCH_CODE_TOOL_NAME } from '../github_search_code';
import { GITHUB_SEARCH_REPOSITORIES_TOOL_NAME } from '../github_search_repos';
import { GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME } from '../github_view_repo_structure';
import { NPM_PACKAGE_SEARCH_TOOL_NAME } from '../package_search';
import { API_STATUS_CHECK_TOOL_NAME } from '../api_status_check';
import { GITHUB_GET_FILE_CONTENT_TOOL_NAME } from '../github_fetch_content';
import { GITHUB_SEARCH_COMMITS_TOOL_NAME } from '../github_search_commits';
import { GITHUB_SEARCH_ISSUES_TOOL_NAME } from '../github_search_issues';
import { GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME } from '../github_search_pull_requests';

// =============================================================================
// TYPES
// =============================================================================

export type ErrorType =
  | 'rate_limit'
  | 'auth'
  | 'network'
  | 'invalid_query'
  | 'not_found'
  | 'permission'
  | 'cli'
  | 'parsing'
  | 'timeout';

// =============================================================================
// CORE GUIDANCE SYSTEM
// =============================================================================

/**
 * Research guidance for different scenarios
 */
const RESEARCH_GUIDANCE = {
  // Success scenarios - what to do next
  success: {
    [GITHUB_SEARCH_CODE_TOOL_NAME]:
      'Use githubGetFileContent to read complete examples. Search different terms for broader coverage.',
    [GITHUB_SEARCH_REPOSITORIES_TOOL_NAME]:
      'Use githubViewRepoStructure to explore project organization. Check popular repos first.',
    [GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME]:
      'Use githubGetFileContent to read key files (README, main modules). Focus on examples/ and docs/.',
    [NPM_PACKAGE_SEARCH_TOOL_NAME]:
      'Use githubViewRepoStructure to explore package repository. Check official packages first.',
    [API_STATUS_CHECK_TOOL_NAME]:
      'Proceed with repository searches. Use organization access for private repos when available.',
    [GITHUB_GET_FILE_CONTENT_TOOL_NAME]:
      'Analyze the content for patterns. Use githubSearchCode to find similar implementations or usage examples.',
    [GITHUB_SEARCH_COMMITS_TOOL_NAME]:
      'Use commit SHAs with githubGetFileContent to see file states. Search githubSearchCode for related changes.',
    [GITHUB_SEARCH_ISSUES_TOOL_NAME]:
      'Check related pull requests with githubSearchPullRequests. Use githubSearchCode to find implementations.',
    [GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME]:
      'Use commit data with githubGetFileContent. Search githubSearchCode for implementation details.',
  },

  // No results - progressive simplification
  no_results: {
    [GITHUB_SEARCH_CODE_TOOL_NAME]:
      'Try broader terms: single keywords, remove all filters, search different repositories.',
    [GITHUB_SEARCH_REPOSITORIES_TOOL_NAME]:
      'Simplify query: use 1-2 words, try related terms, remove filters, sort by stars.',
    [GITHUB_VIEW_REPO_STRUCTURE_TOOL_NAME]:
      'Check repository name spelling, try different branch (main/master), verify repository exists.',
    [NPM_PACKAGE_SEARCH_TOOL_NAME]:
      'Try functional terms ("auth", "react"), different variations, broader categories.',
    [API_STATUS_CHECK_TOOL_NAME]:
      'Check GitHub CLI installation: run "gh auth login" for authentication.',
    [GITHUB_GET_FILE_CONTENT_TOOL_NAME]:
      'Check file path spelling, try different branch, use githubViewRepoStructure to verify path exists.',
    [GITHUB_SEARCH_COMMITS_TOOL_NAME]:
      'Use broader search terms, remove filters, try different date ranges, search in specific repositories.',
    [GITHUB_SEARCH_ISSUES_TOOL_NAME]:
      'Simplify query, remove state/label filters, try broader terms, search in specific repositories.',
    [GITHUB_SEARCH_PULL_REQUESTS_TOOL_NAME]:
      'Remove filters (state, labels), use broader terms, try different repositories, check merged PRs.',
  },

  // Errors - quick fixes
  error: {
    auth: 'Run "gh auth login" for GitHub, check NPM login status. Use apiStatusCheck to verify.',
    rate_limit:
      'Wait 5-10 minutes, use specific filters (owner, language), or try different search terms.',
    network: 'Check internet connection and retry. Try simpler queries.',
    not_found:
      'Verify spelling and resource existence. Use search tools to discover correct names.',
    permission:
      'Check access rights and authentication. Verify repository visibility.',
    invalid_query:
      'Simplify search terms, remove special characters, use basic keywords.',
    timeout: 'Add filters (language, owner) or use more specific terms.',
    cli: 'Install required CLI tools (gh, npm) and check PATH configuration.',
    parsing: 'Try simpler query or check for service issues.',
  },
} as const;

/**
 * Common error patterns for quick fixes
 */
const ERROR_PATTERNS = {
  '403': 'rate_limit',
  '401': 'auth',
  '404': 'not_found',
  'rate limit': 'rate_limit',
  authentication: 'auth',
  unauthorized: 'auth',
  forbidden: 'rate_limit',
  network: 'network',
  timeout: 'timeout',
  'not found': 'not_found',
  permission: 'permission',
  'validation failed': 'invalid_query',
  'invalid query': 'invalid_query',
  'timed out': 'timeout',
} as const;

// =============================================================================
// FUNCTIONAL API
// =============================================================================

/**
 * Get research guidance for different contexts and outcomes
 */
export function getHints(
  toolName: string,
  context: { stage: string; outcome: string }
): string {
  const { outcome } = context;

  if (outcome === 'found') {
    return (
      RESEARCH_GUIDANCE.success[
        toolName as keyof typeof RESEARCH_GUIDANCE.success
      ] ||
      'Continue systematic research. Use related tools for deeper analysis.'
    );
  }

  if (outcome === 'empty' || outcome === 'blocked') {
    return (
      RESEARCH_GUIDANCE.no_results[
        toolName as keyof typeof RESEARCH_GUIDANCE.no_results
      ] ||
      'Try broader search terms, remove filters, or use different keywords.'
    );
  }

  return 'Continue with systematic research approach.';
}

/**
 * Get error-specific hints
 */
export function getErrorHints(toolName: string, errorType?: ErrorType): string {
  if (errorType && RESEARCH_GUIDANCE.error[errorType]) {
    return RESEARCH_GUIDANCE.error[errorType];
  }

  // Fallback to no results guidance
  return (
    RESEARCH_GUIDANCE.no_results[
      toolName as keyof typeof RESEARCH_GUIDANCE.no_results
    ] || 'Check connection, simplify query, or verify access permissions.'
  );
}

/**
 * Detect error type from error message
 */
export function detectErrorType(errorText: string): ErrorType | undefined {
  if (!errorText) return undefined;

  const text = errorText.toLowerCase();

  // Find matching error pattern
  for (const [pattern, errorType] of Object.entries(ERROR_PATTERNS)) {
    if (text.includes(pattern)) {
      return errorType as ErrorType;
    }
  }

  return undefined;
}

/**
 * Get research guidance for successful results
 */
export function getSuccessGuidance(toolName: string): string {
  return (
    RESEARCH_GUIDANCE.success[
      toolName as keyof typeof RESEARCH_GUIDANCE.success
    ] || 'Continue systematic research. Use related tools for deeper analysis.'
  );
}

/**
 * Get guidance for no results scenarios
 */
export function getNoResultsGuidance(toolName: string): string {
  return (
    RESEARCH_GUIDANCE.no_results[
      toolName as keyof typeof RESEARCH_GUIDANCE.no_results
    ] || 'Try broader search terms, remove filters, or use different keywords.'
  );
}

/**
 * Detect error type and get guidance
 */
export function getErrorGuidance(errorText: string): string {
  if (!errorText) return 'Check error details and try again.';

  const text = errorText.toLowerCase();

  // Find matching error pattern
  for (const [pattern, errorType] of Object.entries(ERROR_PATTERNS)) {
    if (text.includes(pattern)) {
      return RESEARCH_GUIDANCE.error[
        errorType as keyof typeof RESEARCH_GUIDANCE.error
      ];
    }
  }

  return 'Check connection, simplify query, or verify access permissions.';
}

/**
 * Create complete tool result with guidance
 */
export function createToolResult(options: {
  success?: boolean;
  data?: any;
  error?: string;
  toolName: string;
  noResults?: boolean;
}): { isError: boolean; content: Array<{ type: string; text: string }> } {
  const { success = false, data, error, toolName, noResults = false } = options;

  if (error) {
    const guidance = getErrorGuidance(error);
    const fullError = `${error}\n\nGuidance: ${guidance}`;

    return {
      isError: true,
      content: [{ type: 'text', text: fullError }],
    };
  }

  if (noResults) {
    const guidance = getNoResultsGuidance(toolName);
    const message = `No results found.\n\nGuidance: ${guidance}`;

    return {
      isError: true,
      content: [{ type: 'text', text: message }],
    };
  }

  if (success && data) {
    const guidance = getSuccessGuidance(toolName);
    const result = {
      data,
      guidance,
    };

    return {
      isError: false,
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  }

  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(data || {}, null, 2) }],
  };
}

/**
 * Quick error result creation
 */
export function createErrorResult(error: string, toolName: string) {
  return createToolResult({ error, toolName });
}

/**
 * Quick no results result creation
 */
export function createNoResultsResult(toolName: string) {
  return createToolResult({ noResults: true, toolName });
}

/**
 * Quick success result creation
 */
export function createSuccessResult(data: any, toolName: string) {
  return createToolResult({ success: true, data, toolName });
}

// =============================================================================
// LEGACY COMPATIBILITY (to be removed after migration)
// =============================================================================

/**
 * @deprecated Use getHints instead
 */
export function getHint(
  toolName: string,
  intent: 'exploring' | 'debugging' | 'learning' | 'comparing' | 'implementing'
): string {
  if (intent === 'debugging') {
    return getErrorGuidance('general debugging');
  }
  return getSuccessGuidance(toolName);
}

/**
 * @deprecated Use getErrorHints instead
 */
export function getErrorHint(toolName: string, errorResult: any): string {
  const errorText =
    typeof errorResult === 'string'
      ? errorResult
      : errorResult?.message ||
        errorResult?.content?.[0]?.text ||
        String(errorResult);
  return getErrorGuidance(errorText);
}

// Helper function to get error message with suggestion
export function getErrorWithSuggestion(options: {
  baseError: string | string[];
  suggestion?: string | string[];
}): string {
  const { baseError, suggestion } = options;
  const errors = Array.isArray(baseError) ? baseError : [baseError];
  const suggestions = Array.isArray(suggestion)
    ? suggestion
    : suggestion
      ? [suggestion]
      : [];

  let result = errors.join('\n');
  if (suggestions.length > 0) {
    result += '\n\nSuggestion: ' + suggestions.join('\n');
  }
  return result;
}

// Common error messages for backward compatibility
export const ERROR_MESSAGES = {
  AUTHENTICATION_REQUIRED:
    'GitHub authentication required. Run "gh auth login" or use apiStatusCheck tool.',
  RATE_LIMIT_EXCEEDED:
    'Rate limit exceeded. Wait 5-10 minutes or use specific filters (owner, language).',
  NO_RESULTS_FOUND: 'No results found. Try simpler query or different filters.',
  SEARCH_FAILED: 'Search failed. Check connection or simplify query.',
  API_STATUS_CHECK_FAILED: 'API Status Check Failed',
  QUERY_REQUIRED: 'Query required. Provide search keywords.',
  QUERY_TOO_LONG: 'Query too long. Simplify search terms.',
  NO_REPOSITORIES_FOUND:
    'No repositories found - try simpler query or different filters',
  NO_COMMITS_FOUND: 'No commits found - try simpler query or different filters',
  NO_ISSUES_FOUND: 'No issues found - try simpler query or different filters',
  NO_PULL_REQUESTS_FOUND:
    'No pull requests found - try simpler query or different filters',
  REPOSITORY_SEARCH_FAILED:
    'Repository search failed - check connection or query',
  COMMIT_SEARCH_FAILED: 'Commit search failed',
  ISSUE_SEARCH_FAILED: 'Issue search failed - check auth or simplify query',
  PR_SEARCH_FAILED: 'PR search failed - check access and query syntax',
} as const;

export const SUGGESTIONS = {
  SIMPLIFY_QUERY:
    'Try simpler search terms, remove filters, or use different keywords',
  PROVIDE_KEYWORDS: 'Start with simple keywords, then refine based on results',
  DIFFERENT_KEYWORDS: 'Try different keywords or broader categories',
} as const;

export function createNoResultsError(type: string = 'code'): string {
  switch (type) {
    case 'repositories':
      return ERROR_MESSAGES.NO_REPOSITORIES_FOUND;
    case 'commits':
      return ERROR_MESSAGES.NO_COMMITS_FOUND;
    case 'issues':
      return ERROR_MESSAGES.NO_ISSUES_FOUND;
    case 'pull_requests':
      return ERROR_MESSAGES.NO_PULL_REQUESTS_FOUND;
    default:
      return ERROR_MESSAGES.NO_RESULTS_FOUND;
  }
}

export function createSearchFailedError(type: string = 'code'): string {
  switch (type) {
    case 'repositories':
      return ERROR_MESSAGES.REPOSITORY_SEARCH_FAILED;
    case 'commits':
      return ERROR_MESSAGES.COMMIT_SEARCH_FAILED;
    case 'issues':
      return ERROR_MESSAGES.ISSUE_SEARCH_FAILED;
    case 'pull_requests':
      return ERROR_MESSAGES.PR_SEARCH_FAILED;
    default:
      return ERROR_MESSAGES.SEARCH_FAILED;
  }
}

export function createAuthenticationError(): string {
  return ERROR_MESSAGES.AUTHENTICATION_REQUIRED;
}

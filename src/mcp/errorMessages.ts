/**
 * Constants for error messages and suggestions across MCP tools
 * Centralized management of error handling for better consistency
 */

export const ERROR_MESSAGES = {
  // Authentication errors
  AUTHENTICATION_REQUIRED:
    'GitHub authentication required - run api_status_check tool',

  // Rate limit errors
  RATE_LIMIT_EXCEEDED:
    'GitHub rate limit exceeded - try these:\n1. Use more specific filters (language, owner)\n2. Reduce the search scope\n3. Wait and try again later',
  RATE_LIMIT_SIMPLE:
    'GitHub rate limit exceeded - wait or use specific filters',

  // No results errors
  NO_RESULTS_FOUND:
    'No results found. Try simplifying your query or using different filters.',
  NO_REPOSITORIES_FOUND:
    'No repositories found. Try simplifying your query or using different filters.',
  NO_COMMITS_FOUND:
    'No commits found. Try simplifying your query or using different filters.',
  NO_ISSUES_FOUND:
    'No issues found. Try simplifying your query or using different filters.',
  NO_PULL_REQUESTS_FOUND:
    'No pull requests found. Try simplifying your query or using different filters.',
  NO_PACKAGES_FOUND: 'No packages found',

  // Connection/network errors
  SEARCH_FAILED: 'Search failed - verify connection or simplify query',
  REPOSITORY_SEARCH_FAILED:
    'Repository search failed - verify connection or simplify query',
  COMMIT_SEARCH_FAILED: 'Commit search failed',
  COMMIT_SEARCH_EXECUTION_FAILED: 'Commit search execution failed',
  ISSUE_SEARCH_FAILED:
    'GitHub issue search failed - check authentication or simplify query',
  PR_SEARCH_FAILED:
    'GitHub pull requests search failed - verify repository access and query syntax',
  PACKAGE_SEARCH_FAILED:
    'Package search failed - check terms or try different keywords',

  // GitHub CLI errors
  CLI_INVALID_RESPONSE:
    'GitHub CLI returned invalid response - check if GitHub CLI is up to date with "gh version" and try again',

  // Timeout errors
  SEARCH_TIMEOUT:
    'Search timed out - try these:\n1. Add language filter\n2. Specify owner/repo\n3. Use more specific search terms',

  // Query validation errors
  QUERY_TOO_LONG:
    'Search query is too long. Please limit to 256 characters or less - simplify your search terms',
  QUERY_REQUIRED:
    'Search query is required and cannot be empty - provide keywords to search',
  EMPTY_QUERY:
    'Empty query. Try: "useState", "authentication", "docker setup", or use filters like language:python',
  QUERY_TOO_LONG_1000:
    'Query too long (max 1000 chars). Simplify to key terms like "error handling" instead of full sentences.',

  // Repository validation errors
  REPO_FORMAT_ERROR:
    'Repository format error. When no owner is provided, repository must be in "owner/repo" format (e.g., "facebook/react").',
  REPO_OR_OWNER_NOT_FOUND:
    'Repository or owner not found. Check:\n1. Repository/owner name spelling\n2. Repository visibility (private/public)\n3. Your access permissions',

  // Query syntax errors
  INVALID_QUERY_SYNTAX:
    'Invalid query syntax. Note:\n1. Boolean operators (OR, NOT) are not supported in free-text for code search.\n2. Use quotes for exact phrases.\n3. Some special characters may be ignored.',
  VALIDATION_FAILED:
    'Invalid query syntax. Note:\n1. Boolean operators (OR, NOT) are not supported in free-text for code search.\n2. Use quotes for exact phrases.\n3. Some special characters may be ignored.',

  // Size/format validation errors
  INVALID_SIZE_FORMAT:
    'Invalid size format. Use >N, <N, or N..M without quotes',
  INVALID_SEARCH_SCOPE:
    'Invalid search scope. Use "file" for content, "path" for filenames, or both.',

  // API Status check errors
  API_STATUS_CHECK_FAILED: 'API Status Check Failed',
} as const;

export const SUGGESTIONS = {
  // Code search suggestions
  CODE_SEARCH_NO_RESULTS:
    'If the user asked for specific owner check users organizations using tools api_status',

  // Repository search suggestions
  REPO_SEARCH_PRIMARY_FILTER:
    'Requires query or primary filter (owner, language, stars, topic, forks). You can also use owner/repo format like "microsoft/vscode" in the query.',

  // General search suggestions
  SIMPLIFY_QUERY:
    'Try:\n1. Simplify your search query\n2. Add filters (language, owner)\n3. Check GitHub status',

  // Issue/PR search suggestions
  PROVIDE_KEYWORDS: 'provide keywords to search for issues',
  PROVIDE_PR_KEYWORDS: 'provide keywords to search for pull requests',

  // Package search suggestions
  DIFFERENT_KEYWORDS: 'check terms or try different keywords',
} as const;

export const VALIDATION_MESSAGES = {
  EMPTY_QUERY_SUGGESTION:
    'Empty query. Try: "useState", "authentication", "docker setup", or use filters like language:python',
  REPO_FORMAT_SUGGESTION:
    'Repository format error. When no owner is provided, repository must be in "owner/repo" format (e.g., "facebook/react").',
  INVALID_SIZE_SUGGESTION:
    'Invalid size format. Use >N, <N, or N..M without quotes',
  INVALID_SCOPE_SUGGESTION:
    'Invalid search scope. Use "file" for content, "path" for filenames, or both.',
} as const;

// Helper function to get error message with context-specific suggestions
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

// Common error handling patterns
export function createAuthenticationError(): string {
  return ERROR_MESSAGES.AUTHENTICATION_REQUIRED;
}

export function createRateLimitError(detailed: boolean = true): string {
  return detailed
    ? ERROR_MESSAGES.RATE_LIMIT_EXCEEDED
    : ERROR_MESSAGES.RATE_LIMIT_SIMPLE;
}

export function createNoResultsError(
  type:
    | 'code'
    | 'repositories'
    | 'commits'
    | 'issues'
    | 'pull_requests'
    | 'packages' = 'code'
): string {
  switch (type) {
    case 'repositories':
      return ERROR_MESSAGES.NO_REPOSITORIES_FOUND;
    case 'commits':
      return ERROR_MESSAGES.NO_COMMITS_FOUND;
    case 'issues':
      return ERROR_MESSAGES.NO_ISSUES_FOUND;
    case 'pull_requests':
      return ERROR_MESSAGES.NO_PULL_REQUESTS_FOUND;
    case 'packages':
      return ERROR_MESSAGES.NO_PACKAGES_FOUND;
    default:
      return ERROR_MESSAGES.NO_RESULTS_FOUND;
  }
}

export function createSearchFailedError(
  type:
    | 'code'
    | 'repositories'
    | 'commits'
    | 'issues'
    | 'pull_requests'
    | 'packages' = 'code'
): string {
  switch (type) {
    case 'repositories':
      return ERROR_MESSAGES.REPOSITORY_SEARCH_FAILED;
    case 'commits':
      return ERROR_MESSAGES.COMMIT_SEARCH_FAILED;
    case 'issues':
      return ERROR_MESSAGES.ISSUE_SEARCH_FAILED;
    case 'pull_requests':
      return ERROR_MESSAGES.PR_SEARCH_FAILED;
    case 'packages':
      return ERROR_MESSAGES.PACKAGE_SEARCH_FAILED;
    default:
      return ERROR_MESSAGES.SEARCH_FAILED;
  }
}

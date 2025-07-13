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
    'Rate limit exceeded - use specific filters (owner, language) or wait',
  RATE_LIMIT_SIMPLE: 'Rate limit exceeded - wait or add filters',

  // No results errors
  NO_RESULTS_FOUND: 'No results found - try simpler query or different filters',
  NO_REPOSITORIES_FOUND:
    'No repositories found - try simpler query or different filters',
  NO_COMMITS_FOUND: 'No commits found - try simpler query or different filters',
  NO_ISSUES_FOUND: 'No issues found - try simpler query or different filters',
  NO_PULL_REQUESTS_FOUND:
    'No pull requests found - try simpler query or different filters',
  NO_PACKAGES_FOUND: 'No packages found',

  // Connection/network errors
  SEARCH_FAILED: 'Search failed - check connection or simplify query',
  REPOSITORY_SEARCH_FAILED:
    'Repository search failed - check connection or query',
  COMMIT_SEARCH_FAILED: 'Commit search failed',
  COMMIT_SEARCH_EXECUTION_FAILED: 'Commit search execution failed',
  ISSUE_SEARCH_FAILED: 'Issue search failed - check auth or simplify query',
  PR_SEARCH_FAILED: 'PR search failed - check access and query syntax',
  PACKAGE_SEARCH_FAILED: 'Package search failed - try different keywords',

  // GitHub CLI errors
  CLI_INVALID_RESPONSE:
    'GitHub CLI invalid response - check "gh version" and update',

  // Timeout errors
  SEARCH_TIMEOUT:
    'Search timed out - add filters (language, owner) or use specific terms',

  // Query validation errors
  QUERY_TOO_LONG: 'Query too long (max 256 chars) - simplify search terms',
  QUERY_REQUIRED: 'Query required - provide search keywords',
  EMPTY_QUERY:
    'Empty query - try "useState", "authentication", or language:python',
  QUERY_TOO_LONG_1000:
    'Query too long (max 1000 chars) - use key terms like "error handling"',

  // Repository validation errors
  REPO_FORMAT_ERROR:
    'Repository format error - use "owner/repo" format (e.g., "facebook/react")',
  REPO_OR_OWNER_NOT_FOUND:
    'Repository/owner not found - check spelling, visibility, and permissions',

  // Query syntax errors
  INVALID_QUERY_SYNTAX:
    'Invalid syntax - Boolean operators not supported, use quotes for phrases',
  VALIDATION_FAILED:
    'Invalid syntax - Boolean operators not supported, use quotes for phrases',

  // Size/format validation errors
  INVALID_SIZE_FORMAT:
    'Invalid size format - use >N, <N, or N..M without quotes',
  INVALID_SEARCH_SCOPE:
    'Invalid scope - use "file" for content, "path" for filenames',

  // API Status check errors
  API_STATUS_CHECK_FAILED: 'API Status Check Failed',

  // File Content Errors
  FILE_NOT_FOUND: 'File not found in repository',
  FILE_TOO_LARGE: 'File too large to fetch',
  FILE_ACCESS_DENIED: 'Access denied to file',
  FILE_IS_DIRECTORY:
    'Path is a directory. Use github_view_repo_structure to list directory contents',
  FILE_IS_BINARY:
    'Binary file detected. Cannot display as text - download directly from GitHub',
  FILE_IS_EMPTY: 'File is empty - no content to display',
  FILE_DECODE_FAILED:
    'Failed to decode file. Encoding may not be supported (expected UTF-8)',

  // Repository Structure Errors
  REPOSITORY_NOT_FOUND: 'Repository not found',
  REPOSITORY_ACCESS_DENIED: 'Repository access denied',
  REPOSITORY_PATH_NOT_FOUND: 'Path not found in repository',
  REPOSITORY_STRUCTURE_INACCESSIBLE: 'Repository structure not accessible',

  // NPM Errors
  NPM_PACKAGE_NOT_FOUND: 'Package not found on NPM registry',
  NPM_CONNECTION_FAILED: 'NPM registry connection failed',
  NPM_CLI_ERROR: 'NPM CLI issue detected',
  NPM_PERMISSION_ERROR: 'NPM permission issue',
  NPM_REGISTRY_ERROR: 'NPM registry error',

  // Connection/Network Errors
  API_CONNECTION_FAILED: 'Failed to connect to API',
  PATH_NOT_FOUND: 'Path not found in repository',
} as const;

export const SUGGESTIONS = {
  // Code search suggestions
  CODE_SEARCH_NO_RESULTS: `No results found. Try this progression:
1. Remove ALL filters and search with just one keyword
2. Break into several queries with minimal query and filters
3. Use api_status_check to verify access to private repos`,

  // Repository search suggestions
  REPO_SEARCH_PRIMARY_FILTER:
    'Start with simple query (1-2 words), then add filters based on results',

  // General search suggestions
  SIMPLIFY_QUERY: `Try this search progression:
1. Single keyword with NO filters
2. Add ONE filter at a time
3. Try synonyms and related terms
4. Search broader categories`,

  // Issue/PR search suggestions
  PROVIDE_KEYWORDS: 'Start with simple keywords, then refine based on results',
  PROVIDE_PR_KEYWORDS:
    'Begin with basic terms, analyze results, then add filters',

  // Package search suggestions
  DIFFERENT_KEYWORDS: `Try multiple approaches:
1. Single functional terms: "auth", "react"
2. Break compound words: "authlib" → "auth"
3. Search by use case: "user login" vs "authentication"
4. Try category terms: "framework", "tool", "library"`,

  // File Content Suggestions
  FILE_NOT_FOUND_RECOVERY: `Quick fixes:
• Use github_view_repo_structure to verify path exists
• Check for typos in file path
• Try different branch (main/master/develop)`,

  FILE_TOO_LARGE_RECOVERY: `Alternative strategies:
• Use github_search_code to search within the file
• Download directly from GitHub
• Use github_view_repo_structure to find smaller related files
• Look for configuration or summary files instead`,

  // Repository Suggestions
  REPOSITORY_NOT_FOUND_RECOVERY: `This is often due to incorrect repository name. Steps to resolve:
1. Use github_search_repositories to find the correct repository
2. Verify the exact repository name
3. Check if the repository might have been renamed or moved`,

  // NPM Suggestions
  NPM_DISCOVERY_STRATEGIES: `Discovery strategies:
• Functional search: "validation", "testing", "charts"
• Ecosystem search: "react", "typescript", "node"
• Use github_search_repositories for related projects`,

  NPM_PACKAGE_NAME_ALTERNATIVES: `Try these alternatives:
• Try with dashes instead of underscores
• Try without dashes
• Try scoped package format
• Use package_search tool for discovery`,
} as const;

export const VALIDATION_MESSAGES = {
  EMPTY_QUERY_SUGGESTION:
    'Empty query - try "useState", "authentication", or language:python',
  REPO_FORMAT_SUGGESTION:
    'Repository format error - use "owner/repo" format (e.g., "facebook/react")',
  INVALID_SIZE_SUGGESTION:
    'Invalid size format - use >N, <N, or N..M without quotes',
  INVALID_SCOPE_SUGGESTION:
    'Invalid scope - use "file" for content, "path" for filenames',
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

export function createNpmPackageNotFoundError(packageName: string): string {
  const suggestions = [];

  if (packageName.includes('_')) {
    suggestions.push(`• Try with dashes: "${packageName.replace(/_/g, '-')}"`);
  }
  if (packageName.includes('-')) {
    suggestions.push(
      `• Try without dashes: "${packageName.replace(/-/g, '')}"`
    );
  }
  if (!packageName.includes('/') && packageName.length > 2) {
    suggestions.push(
      `• Try scoped format: "@${packageName.slice(0, 3)}/${packageName}"`
    );
  }

  return `${ERROR_MESSAGES.NPM_PACKAGE_NOT_FOUND}: "${packageName}"

${suggestions.length > 0 ? suggestions.join('\n') + '\n\n' : ''}${SUGGESTIONS.NPM_PACKAGE_NAME_ALTERNATIVES}

${SUGGESTIONS.NPM_DISCOVERY_STRATEGIES}`;
}

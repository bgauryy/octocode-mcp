/**
 * Constants for error messages and suggestions across MCP tools
 * Centralized management of error handling for better consistency
 */

export const ERROR_MESSAGES = {
  // Authentication errors
  AUTHENTICATION_REQUIRED:
    'GitHub authentication needed. Run the api_status_check tool to verify connection.',

  // Rate limit errors
  RATE_LIMIT_EXCEEDED:
    'Too many requests. Try using specific filters like owner, language, or wait a few minutes.',
  RATE_LIMIT_SIMPLE:
    'Request limit reached. Wait a few minutes or use more specific search terms.',

  // No results errors
  NO_RESULTS_FOUND:
    'No results found. Try broader search terms or different keywords.',
  NO_REPOSITORIES_FOUND:
    'No repositories found. Try simpler keywords or remove some filters.',
  NO_COMMITS_FOUND:
    'No commits found. Try broader date ranges or different search terms.',
  NO_ISSUES_FOUND: 'No issues found. Try different keywords or remove filters.',
  NO_PULL_REQUESTS_FOUND:
    'No pull requests found. Try broader search terms or different filters.',
  NO_PACKAGES_FOUND:
    'No packages found. Try different package names or keywords.',

  // Connection/network errors
  SEARCH_FAILED:
    'Search failed. Check your connection and try simpler search terms.',
  REPOSITORY_SEARCH_FAILED:
    'Repository search failed. Verify the repository exists and is accessible.',
  COMMIT_SEARCH_FAILED: 'Commit search failed. Try different search criteria.',
  COMMIT_SEARCH_EXECUTION_FAILED:
    'Unable to search commits. Try again with different parameters.',
  ISSUE_SEARCH_FAILED:
    'Issue search failed. Check repository access and try simpler terms.',
  PR_SEARCH_FAILED:
    'Pull request search failed. Verify repository access and search terms.',
  PACKAGE_SEARCH_FAILED:
    'Package search failed. Try different package names or keywords.',

  // GitHub CLI errors
  CLI_INVALID_RESPONSE:
    'GitHub connection issue. Check your internet connection and try again.',

  // Timeout errors
  SEARCH_TIMEOUT:
    'Search took too long. Try more specific terms or add filters like language or owner.',

  // Query validation errors
  QUERY_TOO_LONG: 'Search query too long. Use shorter, more specific terms.',
  QUERY_REQUIRED: 'Search terms required. Provide keywords to search for.',
  EMPTY_QUERY:
    'Empty search query. Try terms like "useState", "authentication", or "error handling".',
  QUERY_TOO_LONG_1000:
    'Query too long. Use key terms and phrases instead of full sentences.',

  // Repository validation errors
  REPO_FORMAT_ERROR:
    'Repository format error. Use "owner/repo" format like "facebook/react".',
  REPO_OR_OWNER_NOT_FOUND:
    'Repository not found. Check spelling and verify the repository is public.',

  // Query syntax errors
  INVALID_QUERY_SYNTAX:
    'Invalid search syntax. Use quotes for phrases instead of AND/OR operators.',
  VALIDATION_FAILED:
    'Invalid search format. Use quotes for phrases and avoid complex operators.',

  // Size/format validation errors
  INVALID_SIZE_FORMAT:
    'Invalid size format. Use formats like ">100", "<50", or "10..100".',
  INVALID_SEARCH_SCOPE:
    'Invalid search scope. Use "file" to search content or "path" for filenames.',

  // API Status check errors
  API_STATUS_CHECK_FAILED:
    'Connection check failed. Verify internet connection and GitHub access.',

  // File Content Errors
  FILE_NOT_FOUND:
    'File not found in repository. Check the file path and repository.',
  FILE_TOO_LARGE:
    'File too large to display. Try viewing smaller sections or download directly.',
  FILE_ACCESS_DENIED: 'Cannot access file. Check repository permissions.',
  FILE_IS_DIRECTORY:
    'Path is a directory. Use githubViewRepoStructure to explore directory contents.',
  FILE_IS_BINARY:
    'Binary file cannot be displayed as text. Download directly from GitHub if needed.',
  FILE_IS_EMPTY: 'File is empty - no content to display.',
  FILE_DECODE_FAILED:
    'Cannot read file content. File may use unsupported encoding.',

  // Repository Structure Errors
  REPOSITORY_NOT_FOUND:
    'Repository not found. Check repository name and access permissions.',
  REPOSITORY_ACCESS_DENIED:
    'Cannot access repository. Verify it exists and is public.',
  REPOSITORY_PATH_NOT_FOUND:
    'Path not found in repository. Check the directory or file path.',
  REPOSITORY_STRUCTURE_INACCESSIBLE:
    'Cannot explore repository structure. Check access permissions.',

  // NPM Errors
  NPM_PACKAGE_NOT_FOUND:
    'Package not found on NPM. Check package name spelling.',
  NPM_CONNECTION_FAILED:
    'Cannot connect to NPM registry. Check internet connection.',
  NPM_CLI_ERROR:
    'NPM tool issue detected. Try again or check NPM installation.',
  NPM_PERMISSION_ERROR: 'NPM permission issue. Check access rights.',
  NPM_REGISTRY_ERROR: 'NPM registry error. Try again later.',

  // Connection/Network Errors
  API_CONNECTION_FAILED:
    'Cannot connect to service. Check internet connection.',
  PATH_NOT_FOUND:
    'Path not found in repository. Verify the file or directory path.',
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
 Use github_view_repo_structure to verify path exists
 Check for typos in file path
 Try different branch (main/master/develop)`,

  FILE_TOO_LARGE_RECOVERY: `Alternative strategies:
 Use github_search_code to search within the file
 Download directly from GitHub
 Use github_view_repo_structure to find smaller related files
 Look for configuration or summary files instead`,

  // Repository Suggestions
  REPOSITORY_NOT_FOUND_RECOVERY: `This is often due to incorrect repository name. Steps to resolve:
1. Use github_search_repositories to find the correct repository
2. Verify the exact repository name
3. Check if the repository might have been renamed or moved`,

  // NPM Suggestions
  NPM_DISCOVERY_STRATEGIES: `Discovery strategies:
 Functional search: "validation", "testing", "charts"
 Ecosystem search: "react", "typescript", "node"
 Use github_search_repositories for related projects`,

  NPM_PACKAGE_NAME_ALTERNATIVES: `Try these alternatives:
 Try with dashes instead of underscores
 Try without dashes
 Try scoped package format
 Use package_search tool for discovery`,
} as const;

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

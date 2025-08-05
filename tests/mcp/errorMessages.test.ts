import { describe, it, expect } from 'vitest';
import {
  ERROR_MESSAGES,
  SUGGESTIONS,
  createAuthenticationError,
  createRateLimitError,
  createNoResultsError,
  createSearchFailedError,
} from '../../src/mcp/errorMessages';

describe('Error Messages', () => {
  describe('ERROR_MESSAGES', () => {
    it('should have authentication error message', () => {
      expect(ERROR_MESSAGES.AUTHENTICATION_REQUIRED).toBe(
        'GitHub authentication needed. Run the api_status_check tool to verify connection.'
      );
    });

    it('should have rate limit error messages', () => {
      expect(ERROR_MESSAGES.RATE_LIMIT_EXCEEDED).toBe(
        'Too many requests. Try using specific filters like owner, language, or wait a few minutes.'
      );
      expect(ERROR_MESSAGES.RATE_LIMIT_SIMPLE).toBe(
        'Request limit reached. Wait a few minutes or use more specific search terms.'
      );
    });

    it('should have no results error messages', () => {
      expect(ERROR_MESSAGES.NO_RESULTS_FOUND).toBe(
        'No results found. Try broader search terms or different keywords.'
      );
      expect(ERROR_MESSAGES.NO_REPOSITORIES_FOUND).toBe(
        'No repositories found. Try simpler keywords or remove some filters.'
      );
      expect(ERROR_MESSAGES.NO_COMMITS_FOUND).toBe(
        'No commits found. Try broader date ranges or different search terms.'
      );
      expect(ERROR_MESSAGES.NO_ISSUES_FOUND).toBe(
        'No issues found. Try different keywords or remove filters.'
      );
      expect(ERROR_MESSAGES.NO_PULL_REQUESTS_FOUND).toBe(
        'No pull requests found. Try broader search terms or different filters.'
      );
      expect(ERROR_MESSAGES.NO_PACKAGES_FOUND).toBe(
        'No packages found. Try different package names or keywords.'
      );
    });

    it('should have search failed error messages', () => {
      expect(ERROR_MESSAGES.SEARCH_FAILED).toBe(
        'Search failed. Check your connection and try simpler search terms.'
      );
      expect(ERROR_MESSAGES.REPOSITORY_SEARCH_FAILED).toBe(
        'Repository search failed. Verify the repository exists and is accessible.'
      );
      expect(ERROR_MESSAGES.COMMIT_SEARCH_FAILED).toBe(
        'Commit search failed. Try different search criteria.'
      );
      expect(ERROR_MESSAGES.COMMIT_SEARCH_EXECUTION_FAILED).toBe(
        'Unable to search commits. Try again with different parameters.'
      );
      expect(ERROR_MESSAGES.ISSUE_SEARCH_FAILED).toBe(
        'Issue search failed. Check repository access and try simpler terms.'
      );
      expect(ERROR_MESSAGES.PR_SEARCH_FAILED).toBe(
        'Pull request search failed. Verify repository access and search terms.'
      );
      expect(ERROR_MESSAGES.PACKAGE_SEARCH_FAILED).toBe(
        'Package search failed. Try different package names or keywords.'
      );
    });

    it('should have CLI error messages', () => {
      expect(ERROR_MESSAGES.CLI_INVALID_RESPONSE).toBe(
        'GitHub connection issue. Check your internet connection and try again.'
      );
    });

    it('should have timeout error messages', () => {
      expect(ERROR_MESSAGES.SEARCH_TIMEOUT).toBe(
        'Search took too long. Try more specific terms or add filters like language or owner.'
      );
    });

    it('should have query validation error messages', () => {
      expect(ERROR_MESSAGES.QUERY_TOO_LONG).toBe(
        'Search query too long. Use shorter, more specific terms.'
      );
      expect(ERROR_MESSAGES.QUERY_REQUIRED).toBe(
        'Search terms required. Provide keywords to search for.'
      );
      expect(ERROR_MESSAGES.EMPTY_QUERY).toBe(
        'Empty search query. Try terms like "useState", "authentication", or "error handling".'
      );
      expect(ERROR_MESSAGES.QUERY_TOO_LONG_1000).toBe(
        'Query too long. Use key terms and phrases instead of full sentences.'
      );
    });

    it('should have repository validation error messages', () => {
      expect(ERROR_MESSAGES.REPO_FORMAT_ERROR).toBe(
        'Repository format error. Use "owner/repo" format like "facebook/react".'
      );
      expect(ERROR_MESSAGES.REPO_OR_OWNER_NOT_FOUND).toBe(
        'Repository not found. Check spelling and verify the repository is public.'
      );
    });

    it('should have query syntax error messages', () => {
      expect(ERROR_MESSAGES.INVALID_QUERY_SYNTAX).toBe(
        'Invalid search syntax. Use quotes for phrases instead of AND/OR operators.'
      );
      expect(ERROR_MESSAGES.VALIDATION_FAILED).toBe(
        'Invalid search format. Use quotes for phrases and avoid complex operators.'
      );
    });

    it('should have size/format validation error messages', () => {
      expect(ERROR_MESSAGES.INVALID_SIZE_FORMAT).toBe(
        'Invalid size format. Use formats like ">100", "<50", or "10..100".'
      );
      expect(ERROR_MESSAGES.INVALID_SEARCH_SCOPE).toBe(
        'Invalid search scope. Use "file" to search content or "path" for filenames.'
      );
    });

    it('should have API status check error messages', () => {
      expect(ERROR_MESSAGES.API_STATUS_CHECK_FAILED).toBe(
        'Connection check failed. Verify internet connection and GitHub access.'
      );
    });

    it('should have file content error messages', () => {
      expect(ERROR_MESSAGES.FILE_NOT_FOUND).toBe(
        'File not found in repository. Check the file path and repository.'
      );
      expect(ERROR_MESSAGES.FILE_TOO_LARGE).toBe(
        'File too large to display. Try viewing smaller sections or download directly.'
      );
      expect(ERROR_MESSAGES.FILE_ACCESS_DENIED).toBe(
        'Cannot access file. Check repository permissions.'
      );
      expect(ERROR_MESSAGES.FILE_IS_DIRECTORY).toBe(
        'Path is a directory. Use githubViewRepoStructure to explore directory contents.'
      );
      expect(ERROR_MESSAGES.FILE_IS_BINARY).toBe(
        'Binary file cannot be displayed as text. Download directly from GitHub if needed.'
      );
      expect(ERROR_MESSAGES.FILE_IS_EMPTY).toBe(
        'File is empty - no content to display.'
      );
      expect(ERROR_MESSAGES.FILE_DECODE_FAILED).toBe(
        'Cannot read file content. File may use unsupported encoding.'
      );
    });

    it('should have repository structure error messages', () => {
      expect(ERROR_MESSAGES.REPOSITORY_NOT_FOUND).toBe(
        'Repository not found. Check repository name and access permissions.'
      );
      expect(ERROR_MESSAGES.REPOSITORY_ACCESS_DENIED).toBe(
        'Cannot access repository. Verify it exists and is public.'
      );
      expect(ERROR_MESSAGES.REPOSITORY_PATH_NOT_FOUND).toBe(
        'Path not found in repository. Check the directory or file path.'
      );
      expect(ERROR_MESSAGES.REPOSITORY_STRUCTURE_INACCESSIBLE).toBe(
        'Cannot explore repository structure. Check access permissions.'
      );
    });

    it('should have NPM error messages', () => {
      expect(ERROR_MESSAGES.NPM_PACKAGE_NOT_FOUND).toBe(
        'Package not found on NPM. Check package name spelling.'
      );
      expect(ERROR_MESSAGES.NPM_CONNECTION_FAILED).toBe(
        'Cannot connect to NPM registry. Check internet connection.'
      );
      expect(ERROR_MESSAGES.NPM_CLI_ERROR).toBe(
        'NPM tool issue detected. Try again or check NPM installation.'
      );
      expect(ERROR_MESSAGES.NPM_PERMISSION_ERROR).toBe(
        'NPM permission issue. Check access rights.'
      );
      expect(ERROR_MESSAGES.NPM_REGISTRY_ERROR).toBe(
        'NPM registry error. Try again later.'
      );
    });

    it('should have connection/network error messages', () => {
      expect(ERROR_MESSAGES.API_CONNECTION_FAILED).toBe(
        'Cannot connect to service. Check internet connection.'
      );
      expect(ERROR_MESSAGES.PATH_NOT_FOUND).toBe(
        'Path not found in repository. Verify the file or directory path.'
      );
    });
  });

  describe('SUGGESTIONS', () => {
    it('should have code search suggestions', () => {
      expect(SUGGESTIONS.CODE_SEARCH_NO_RESULTS).toContain(
        'No results found. Try this progression:'
      );
      expect(SUGGESTIONS.CODE_SEARCH_NO_RESULTS).toContain(
        'Use api_status_check to verify access to private repos'
      );
    });

    it('should have repository search suggestions', () => {
      expect(SUGGESTIONS.REPO_SEARCH_PRIMARY_FILTER).toBe(
        'Start with simple query (1-2 words), then add filters based on results'
      );
    });

    it('should have general search suggestions', () => {
      expect(SUGGESTIONS.SIMPLIFY_QUERY).toContain(
        'Try this search progression:'
      );
      expect(SUGGESTIONS.SIMPLIFY_QUERY).toContain('Search broader categories');
    });

    it('should have issue/PR search suggestions', () => {
      expect(SUGGESTIONS.PROVIDE_KEYWORDS).toBe(
        'Start with simple keywords, then refine based on results'
      );
      expect(SUGGESTIONS.PROVIDE_PR_KEYWORDS).toBe(
        'Begin with basic terms, analyze results, then add filters'
      );
    });

    it('should have package search suggestions', () => {
      expect(SUGGESTIONS.DIFFERENT_KEYWORDS).toContain(
        'Try multiple approaches:'
      );
      expect(SUGGESTIONS.DIFFERENT_KEYWORDS).toContain(
        'Try category terms: "framework", "tool", "library"'
      );
    });

    it('should have file content suggestions', () => {
      expect(SUGGESTIONS.FILE_NOT_FOUND_RECOVERY).toContain('Quick fixes:');
      expect(SUGGESTIONS.FILE_NOT_FOUND_RECOVERY).toContain(
        'Use github_view_repo_structure to verify path exists'
      );
      expect(SUGGESTIONS.FILE_TOO_LARGE_RECOVERY).toContain(
        'Alternative strategies:'
      );
      expect(SUGGESTIONS.FILE_TOO_LARGE_RECOVERY).toContain(
        'Use github_search_code to search within the file'
      );
    });

    it('should have repository suggestions', () => {
      expect(SUGGESTIONS.REPOSITORY_NOT_FOUND_RECOVERY).toContain(
        'This is often due to incorrect repository name. Steps to resolve:'
      );
      expect(SUGGESTIONS.REPOSITORY_NOT_FOUND_RECOVERY).toContain(
        'Use github_search_repositories to find the correct repository'
      );
    });

    it('should have NPM suggestions', () => {
      expect(SUGGESTIONS.NPM_DISCOVERY_STRATEGIES).toContain(
        'Discovery strategies:'
      );
      expect(SUGGESTIONS.NPM_DISCOVERY_STRATEGIES).toContain(
        'Use github_search_repositories for related projects'
      );
      expect(SUGGESTIONS.NPM_PACKAGE_NAME_ALTERNATIVES).toContain(
        'Try these alternatives:'
      );
      expect(SUGGESTIONS.NPM_PACKAGE_NAME_ALTERNATIVES).toContain(
        'Use package_search tool for discovery'
      );
    });
  });

  describe('createAuthenticationError', () => {
    it('should return authentication error message', () => {
      const error = createAuthenticationError();
      expect(error).toBe(ERROR_MESSAGES.AUTHENTICATION_REQUIRED);
    });
  });

  describe('createRateLimitError', () => {
    it('should return detailed rate limit error when detailed is true', () => {
      const error = createRateLimitError(true);
      expect(error).toBe(ERROR_MESSAGES.RATE_LIMIT_EXCEEDED);
    });

    it('should return simple rate limit error when detailed is false', () => {
      const error = createRateLimitError(false);
      expect(error).toBe(ERROR_MESSAGES.RATE_LIMIT_SIMPLE);
    });

    it('should return detailed rate limit error by default', () => {
      const error = createRateLimitError();
      expect(error).toBe(ERROR_MESSAGES.RATE_LIMIT_EXCEEDED);
    });
  });

  describe('createNoResultsError', () => {
    it('should return default no results error', () => {
      const error = createNoResultsError();
      expect(error).toBe(ERROR_MESSAGES.NO_RESULTS_FOUND);
    });

    it('should return repositories no results error', () => {
      const error = createNoResultsError('repositories');
      expect(error).toBe(ERROR_MESSAGES.NO_REPOSITORIES_FOUND);
    });

    it('should return commits no results error', () => {
      const error = createNoResultsError('commits');
      expect(error).toBe(ERROR_MESSAGES.NO_COMMITS_FOUND);
    });

    it('should return issues no results error', () => {
      const error = createNoResultsError('issues');
      expect(error).toBe(ERROR_MESSAGES.NO_ISSUES_FOUND);
    });

    it('should return pull requests no results error', () => {
      const error = createNoResultsError('pull_requests');
      expect(error).toBe(ERROR_MESSAGES.NO_PULL_REQUESTS_FOUND);
    });

    it('should return packages no results error', () => {
      const error = createNoResultsError('packages');
      expect(error).toBe(ERROR_MESSAGES.NO_PACKAGES_FOUND);
    });
  });

  describe('createSearchFailedError', () => {
    it('should return default search failed error', () => {
      const error = createSearchFailedError();
      expect(error).toBe(ERROR_MESSAGES.SEARCH_FAILED);
    });

    it('should return repositories search failed error', () => {
      const error = createSearchFailedError('repositories');
      expect(error).toBe(ERROR_MESSAGES.REPOSITORY_SEARCH_FAILED);
    });

    it('should return commits search failed error', () => {
      const error = createSearchFailedError('commits');
      expect(error).toBe(ERROR_MESSAGES.COMMIT_SEARCH_FAILED);
    });

    it('should return issues search failed error', () => {
      const error = createSearchFailedError('issues');
      expect(error).toBe(ERROR_MESSAGES.ISSUE_SEARCH_FAILED);
    });

    it('should return pull requests search failed error', () => {
      const error = createSearchFailedError('pull_requests');
      expect(error).toBe(ERROR_MESSAGES.PR_SEARCH_FAILED);
    });

    it('should return packages search failed error', () => {
      const error = createSearchFailedError('packages');
      expect(error).toBe(ERROR_MESSAGES.PACKAGE_SEARCH_FAILED);
    });
  });
});

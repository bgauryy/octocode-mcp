import { RequestError } from 'octokit';
import type { GitHubAPIError } from '../types/github-openapi';

/**
 * Enhanced error handling for GitHub API
 * Provides detailed error information with scope suggestions and proper typing
 */
export function handleGitHubAPIError(error: unknown): GitHubAPIError {
  if (error instanceof RequestError) {
    const { status, message, response } = error;

    switch (status) {
      case 401:
        return {
          error: 'GitHub authentication required',
          status,
          type: 'http',
          scopesSuggestion: 'Set GITHUB_TOKEN or GH_TOKEN environment variable',
        };
      case 403: {
        const remaining = response?.headers?.['x-ratelimit-remaining'];
        const reset = response?.headers?.['x-ratelimit-reset'];
        const acceptedScopes = response?.headers?.['x-accepted-oauth-scopes'];
        const tokenScopes = response?.headers?.['x-oauth-scopes'];

        if (remaining === '0') {
          const resetTime = reset ? new Date(parseInt(reset) * 1000) : null;
          return {
            error: 'GitHub API rate limit exceeded',
            status,
            type: 'http',
            rateLimitRemaining: 0,
            rateLimitReset: resetTime ? resetTime.getTime() : undefined,
            retryAfter: resetTime
              ? Math.ceil((resetTime.getTime() - Date.now()) / 1000)
              : 3600,
            scopesSuggestion:
              'Set GITHUB_TOKEN for higher rate limits (5000/hour vs 60/hour)',
          };
        }

        // Generate scope suggestions
        let scopesSuggestion = 'Check repository permissions or authentication';
        if (acceptedScopes && tokenScopes) {
          scopesSuggestion = generateScopesSuggestion(
            String(acceptedScopes),
            String(tokenScopes)
          );
        }

        return {
          error: 'Access forbidden - insufficient permissions',
          status,
          type: 'http',
          scopesSuggestion,
        };
      }
      case 422:
        return {
          error: 'Invalid search query or request parameters',
          status,
          type: 'http',
          scopesSuggestion: 'Check search syntax and parameter values',
        };
      case 404:
        return {
          error: 'Repository, resource, or path not found',
          status,
          type: 'http',
        };
      case 502:
      case 503:
      case 504:
        return {
          error: 'GitHub API temporarily unavailable',
          status,
          type: 'network',
          scopesSuggestion: 'Retry the request after a short delay',
        };
      default:
        return {
          error: message || 'GitHub API request failed',
          status,
          type: 'http',
        };
    }
  }

  // Handle network errors
  if (error instanceof Error) {
    if (
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ECONNREFUSED')
    ) {
      return {
        error: 'Network connection failed',
        type: 'network',
        scopesSuggestion: 'Check internet connection and GitHub API status',
      };
    }
    if (error.message.includes('timeout')) {
      return {
        error: 'Request timeout',
        type: 'network',
        scopesSuggestion: 'Retry the request or check network connectivity',
      };
    }
  }

  return {
    error: error instanceof Error ? error.message : 'Unknown error occurred',
    type: 'unknown',
  };
}

/**
 * Generate scope suggestions for GitHub API access
 */
function generateScopesSuggestion(
  acceptedScopes: string,
  tokenScopes: string
): string {
  const accepted = acceptedScopes
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const current = tokenScopes
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const missing = accepted.filter(scope => !current.includes(scope));

  if (missing.length > 0) {
    const scopeList = missing.join(', ');
    return `Missing required scopes: ${scopeList}. Run: gh auth refresh -s ${missing.join(' -s ')}`;
  }

  return 'Token may not have sufficient permissions for this operation';
}

/**
 * Generate smart hints for file access issues
 */
export function generateFileAccessHints(
  owner: string,
  repo: string,
  filePath: string,
  branch: string,
  defaultBranch?: string | null,
  error?: string
): string[] {
  const hints: string[] = [];

  if (error?.includes('404')) {
    // File or branch not found
    if (defaultBranch && defaultBranch !== branch) {
      hints.push(
        `Try the default branch "${defaultBranch}" instead of "${branch}"`
      );
    }

    hints.push(
      `Use githubViewRepoStructure to verify the file path "${filePath}" exists in ${owner}/${repo}`,
      `Use githubSearchCode to find similar files if "${filePath}" has changed or moved`
    );

    // Suggest common branch alternatives
    const commonBranches = ['main', 'master', 'develop', 'dev'];
    const suggestedBranches = commonBranches
      .filter(b => b !== branch && b !== defaultBranch)
      .slice(0, 2);

    if (suggestedBranches.length > 0) {
      hints.push(`Try common branches: ${suggestedBranches.join(', ')}`);
    }
  } else if (error?.includes('403')) {
    hints.push(
      `Repository ${owner}/${repo} may be private - ensure GITHUB_TOKEN is set`,
      'Check if you have access permissions to this repository'
    );
  } else if (error?.includes('rate limit')) {
    hints.push(
      'GitHub API rate limit exceeded - wait before retrying',
      'Set GITHUB_TOKEN environment variable for higher rate limits'
    );
  }

  return hints;
}

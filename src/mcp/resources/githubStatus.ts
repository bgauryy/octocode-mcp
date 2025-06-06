import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { execSync } from 'child_process';

interface GitHubRateLimit {
  limit: number;
  used: number;
  remaining: number;
  reset: number;
}

interface GitHubRateLimitResponse {
  resources: {
    core: GitHubRateLimit;
    search: GitHubRateLimit;
    graphql: GitHubRateLimit;
    integration_manifest: GitHubRateLimit;
    source_import: GitHubRateLimit;
    code_scanning_upload: GitHubRateLimit;
    code_scanning_autofix: GitHubRateLimit;
    actions_runner_registration: GitHubRateLimit;
    scim: GitHubRateLimit;
    dependency_snapshots: GitHubRateLimit;
    audit_log: GitHubRateLimit;
    audit_log_streaming: GitHubRateLimit;
    code_search: GitHubRateLimit;
  };
  rate: GitHubRateLimit;
}

interface ProcessedRateLimit {
  primary_api: {
    remaining: number;
    limit: number;
    reset_time: string;
    usage_percentage: number;
  };
  search_api: {
    remaining: number;
    limit: number;
    reset_time: string;
    usage_percentage: number;
  };
  code_search: {
    remaining: number;
    limit: number;
    reset_time: string;
    usage_percentage: number;
  };
  graphql_api: {
    remaining: number;
    limit: number;
    reset_time: string;
    usage_percentage: number;
  };
  status: 'healthy' | 'limited' | 'exhausted';
  next_reset: string;
}

function processRateLimit(
  rateLimit: GitHubRateLimitResponse
): ProcessedRateLimit {
  const formatResetTime = (reset: number) =>
    new Date(reset * 1000).toISOString();
  const calculateUsage = (used: number, limit: number) =>
    Math.round((used / limit) * 100);

  const core = rateLimit.resources.core;
  const search = rateLimit.resources.search;
  const codeSearch = rateLimit.resources.code_search;
  const graphql = rateLimit.resources.graphql;

  // Determine overall status based on most restrictive API
  const minRemaining = Math.min(
    core.remaining,
    search.remaining,
    codeSearch.remaining,
    graphql.remaining
  );
  let status: 'healthy' | 'limited' | 'exhausted';

  if (minRemaining === 0) {
    status = 'exhausted';
  } else if (minRemaining < 10) {
    status = 'limited';
  } else {
    status = 'healthy';
  }

  // Find the earliest reset time
  const nextReset = Math.min(
    core.reset,
    search.reset,
    codeSearch.reset,
    graphql.reset
  );

  return {
    primary_api: {
      remaining: core.remaining,
      limit: core.limit,
      reset_time: formatResetTime(core.reset),
      usage_percentage: calculateUsage(core.used, core.limit),
    },
    search_api: {
      remaining: search.remaining,
      limit: search.limit,
      reset_time: formatResetTime(search.reset),
      usage_percentage: calculateUsage(search.used, search.limit),
    },
    code_search: {
      remaining: codeSearch.remaining,
      limit: codeSearch.limit,
      reset_time: formatResetTime(codeSearch.reset),
      usage_percentage: calculateUsage(codeSearch.used, codeSearch.limit),
    },
    graphql_api: {
      remaining: graphql.remaining,
      limit: graphql.limit,
      reset_time: formatResetTime(graphql.reset),
      usage_percentage: calculateUsage(graphql.used, graphql.limit),
    },
    status,
    next_reset: formatResetTime(nextReset),
  };
}

export function registerGithubStatusResource(server: McpServer) {
  server.resource(
    'github-login-and-rate-limit',
    'github://login-and-rate-limit',
    async uri => {
      try {
        // Check GitHub CLI version
        const ghVersion = execSync('gh --version', {
          encoding: 'utf-8',
        }).trim();

        let isAuthenticated = false;
        let authError = null;

        try {
          // gh auth status outputs to stderr, capture it
          execSync('gh auth status', {
            encoding: 'utf-8',
          });
        } catch (e) {
          // gh auth status always outputs to stderr, so we expect this "error"
          const error = e as any;
          if (error.stderr) {
            const output = error.stderr.toString().trim();
            // Only check if authenticated, don't expose user details
            isAuthenticated = output.includes('✓ Logged in');
            if (!isAuthenticated) {
              authError = 'Not authenticated';
            }
          } else {
            authError = 'Unable to check authentication status';
          }
        }

        let rateLimitInfo: ProcessedRateLimit | { error: string } = {
          error: 'Unknown',
        };
        try {
          const rateLimitData = execSync('gh api rate_limit', {
            encoding: 'utf-8',
          });
          const rateLimit: GitHubRateLimitResponse = JSON.parse(rateLimitData);
          rateLimitInfo = processRateLimit(rateLimit);
        } catch (e) {
          rateLimitInfo = {
            error:
              'Unable to check rate limit - authentication may be required',
          };
        }

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  status: 'GitHub API integration via CLI - LIVE STATUS',
                  description:
                    'Real-time GitHub API status including authentication and rate limits for different API endpoints',
                  gh_version: ghVersion,
                  authenticated: isAuthenticated,
                  auth_error: authError,
                  rate_limits: rateLimitInfo,
                  usage_notes: {
                    primary_api:
                      'Used for most GitHub operations (repos, issues, PRs, etc.)',
                    search_api:
                      'Used for searching repositories, code, issues, users',
                    code_search:
                      'Dedicated endpoint for code search operations (most restrictive)',
                    graphql_api: 'Used for GraphQL queries',
                    status_meanings: {
                      healthy: 'All APIs have sufficient remaining requests',
                      limited:
                        'Some APIs are running low on requests (< 10 remaining)',
                      exhausted: 'One or more APIs have no remaining requests',
                    },
                  },
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  status: 'GitHub API integration via CLI - ERROR',
                  error: (error as Error).message,
                  timestamp: new Date().toISOString(),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );
}

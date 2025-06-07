import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { executeGitHubCommand } from '../../utils/exec';

interface GitHubRateLimit {
  limit: number;
  used: number;
  remaining: number;
  reset: number;
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

export function registerGithubRateLimitResource(server: McpServer) {
  server.resource('github-rate-limits', 'github://rate-limits', async uri => {
    try {
      // Use safe GitHub command execution for API calls
      const rateLimitResult = await executeGitHubCommand(
        'api',
        ['rate_limit'],
        {
          timeout: 10000,
          cache: false,
        }
      );

      if (rateLimitResult.isError) {
        const errorText = String(
          rateLimitResult.content[0]?.text || 'Failed to fetch rate limits'
        );
        throw new Error(errorText);
      }

      // Extract and parse the rate limit data
      const content = String(rateLimitResult.content[0]?.text || '');
      if (!content) {
        throw new Error('No rate limit data received');
      }

      let rateLimit: GitHubRateLimitResponse;
      try {
        const parsed = JSON.parse(content);
        rateLimit = parsed.result || parsed;
      } catch {
        rateLimit = JSON.parse(content);
      }

      const rateLimitInfo = processRateLimit(rateLimit);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                status: 'GitHub API Rate Limits - LIVE STATUS',
                description:
                  'Real-time GitHub API rate limit status for all endpoints',
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
                recommendations: {
                  healthy: 'All APIs ready for use',
                  limited: 'Consider prioritizing essential requests only',
                  exhausted:
                    'Wait until reset time or use alternative approaches',
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
                status: 'GitHub API Rate Limits - ERROR',
                error: (error as Error).message,
                message:
                  'Unable to check rate limits - authentication may be required',
                timestamp: new Date().toISOString(),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  });
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

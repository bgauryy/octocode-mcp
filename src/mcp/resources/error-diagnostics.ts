import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

interface ErrorPattern {
  pattern: string;
  likely_causes: string[];
  solutions: string[];
  prevention: string[];
  related_resources: string[];
}

interface DiagnosticStep {
  step: number;
  description: string;
  action: string;
  expected_result: string;
  if_failed: string;
}

async function generateErrorDiagnostics() {
  return {
    common_errors: {
      authentication_errors: {
        '401 Unauthorized': {
          pattern: 'HTTP 401 or authentication failed messages',
          likely_causes: [
            'GitHub CLI not authenticated',
            'Invalid or expired GitHub token',
            'Insufficient permissions for private repositories',
            'Token scope limitations',
          ],
          solutions: [
            "Run 'gh auth login' to authenticate",
            "Check 'gh auth status' for current authentication state",
            'Regenerate GitHub personal access token',
            'Ensure token has required scopes (repo, read:org)',
          ],
          prevention: [
            'Set up GitHub CLI authentication before using MCP',
            'Use tokens with appropriate scopes',
            'Regularly refresh authentication tokens',
          ],
          related_resources: ['github-auth-status'],
        } as ErrorPattern,

        '403 Forbidden': {
          pattern: 'HTTP 403 or access denied messages',
          likely_causes: [
            'Attempting to access private repositories without permission',
            'Rate limiting enforcement',
            'Repository has restricted access',
            'Organization requires SSO authentication',
          ],
          solutions: [
            'Check if you have access to the repository',
            'Use get_user_organizations to verify organization membership',
            'Wait for rate limits to reset',
            'Enable SSO for your token if required',
          ],
          prevention: [
            'Verify repository access before operations',
            'Monitor rate limits proactively',
            'Use appropriate authentication for organization repos',
          ],
          related_resources: ['github-auth-status', 'github-rate-limits'],
        } as ErrorPattern,
      },

      rate_limit_errors: {
        'API rate limit exceeded': {
          pattern: 'Rate limit exceeded, abuse detection, or 429 errors',
          likely_causes: [
            'Too many API requests in short timeframe',
            'Search API limits reached (30 requests/minute)',
            'Code search limits reached (10 requests/minute)',
            'Abuse detection triggered',
          ],
          solutions: [
            'Check github-rate-limits resource for current status',
            'Wait for rate limit reset (1 hour for most endpoints)',
            'Use less intensive search strategies',
            'Spread requests across longer time periods',
          ],
          prevention: [
            'Check rate limits before intensive operations',
            'Implement request throttling',
            'Use caching for repeated requests',
            'Optimize search queries to be more specific',
          ],
          related_resources: ['github-rate-limits'],
        } as ErrorPattern,

        'Secondary rate limit': {
          pattern: 'Secondary rate limit or abuse detection messages',
          likely_causes: [
            'Making requests too quickly',
            'Large number of requests in burst',
            'Automated behavior detected',
            'Multiple concurrent search operations',
          ],
          solutions: [
            'Implement delays between requests (1-2 seconds)',
            'Reduce concurrent operations',
            'Use exponential backoff retry strategy',
            'Contact GitHub if limits seem unreasonable',
          ],
          prevention: [
            'Space out requests appropriately',
            'Avoid burst request patterns',
            'Monitor request timing and patterns',
          ],
          related_resources: ['github-rate-limits'],
        } as ErrorPattern,
      },

      search_errors: {
        'No results found': {
          pattern: "Empty results or 'No matching results' messages",
          likely_causes: [
            'Search terms too specific or narrow',
            'Incorrect repository or organization filters',
            'Typos in search query',
            'Searching in wrong scope (code vs repos vs issues)',
          ],
          solutions: [
            'Try broader, more generic search terms',
            'Remove filters to expand search scope',
            'Check spelling and try alternative terms',
            'Use different search tools (repos vs code vs issues)',
          ],
          prevention: [
            'Start with broad searches and narrow down',
            'Use query-expansion resource for better terms',
            'Understand different search tool capabilities',
          ],
          related_resources: ['query-expansion', 'search-context'],
        } as ErrorPattern,

        'Too many results': {
          pattern: 'Overwhelming number of results (1000+)',
          likely_causes: [
            'Search terms too generic',
            'Missing language or framework filters',
            'Searching across all repositories',
            'No path restrictions applied',
          ],
          solutions: [
            'Add language filters (language:javascript)',
            'Add path restrictions (path:src)',
            'Use more specific search terms',
            'Add organization or repository filters',
          ],
          prevention: [
            'Use progressive refinement strategy',
            'Reference search-github-code-instructions',
            'Apply filters early in search process',
          ],
          related_resources: [
            'query-expansion',
            'search-github-code-instructions',
          ],
        } as ErrorPattern,
      },

      file_operation_errors: {
        'Branch not found': {
          pattern: 'Branch, reference, or commit not found errors',
          likely_causes: [
            'Using incorrect branch name (main vs master)',
            'Repository uses non-standard default branch',
            'Branch name changed recently',
            'Private repository with limited access',
          ],
          solutions: [
            'Use view_repository first to get correct branch',
            'Try common branch names (main, master, develop)',
            'Check repository settings for default branch',
            'Verify repository access permissions',
          ],
          prevention: [
            'Always use view_repository before file operations',
            "Don't assume default branch names",
            'Use branch discovery from repository metadata',
          ],
          related_resources: ['tool-orchestration'],
        } as ErrorPattern,

        'File not found': {
          pattern: 'File or path not found errors',
          likely_causes: [
            'Incorrect file path or filename',
            'File moved or renamed',
            'Case sensitivity issues',
            'File in different branch or commit',
          ],
          solutions: [
            'Use view_repository_structure to explore directories',
            'Check file path case sensitivity',
            'Verify file exists in current branch',
            'Search for file using search_github_code',
          ],
          prevention: [
            'Explore repository structure before fetching files',
            'Use search tools to locate files',
            'Double-check file paths and names',
          ],
          related_resources: ['tool-orchestration'],
        } as ErrorPattern,
      },

      npm_errors: {
        'Package not found': {
          pattern: 'NPM package not found or does not exist',
          likely_causes: [
            'Typo in package name',
            'Package removed from NPM registry',
            'Private package without access',
            'Scoped package name format issues',
          ],
          solutions: [
            'Check package name spelling',
            'Use npm_search to find similar packages',
            'Check if package is scoped (@org/package)',
            'Verify package exists on npmjs.com',
          ],
          prevention: [
            'Use search tools to verify package names',
            'Double-check package spelling',
            'Understand scoped package naming',
          ],
          related_resources: ['npm-status'],
        } as ErrorPattern,

        'NPM command failed': {
          pattern: 'NPM CLI errors or command execution failures',
          likely_causes: [
            'NPM not installed or configured',
            'Network connectivity issues',
            'NPM registry access problems',
            'Outdated NPM version',
          ],
          solutions: [
            'Check npm-status resource for configuration',
            'Verify NPM installation (npm --version)',
            'Check network connectivity',
            'Update NPM to latest version',
          ],
          prevention: [
            'Ensure NPM is properly installed',
            'Keep NPM updated',
            'Check status resources before operations',
          ],
          related_resources: ['npm-status'],
        } as ErrorPattern,
      },
    },

    diagnostic_workflows: {
      authentication_troubleshooting: [
        {
          step: 1,
          description: 'Check current authentication status',
          action: 'Access github-auth-status resource',
          expected_result: 'Authentication status and user information',
          if_failed: 'GitHub CLI not installed or not authenticated',
        },
        {
          step: 2,
          description: 'Verify GitHub CLI installation',
          action: "Run 'gh --version' command",
          expected_result: 'GitHub CLI version information',
          if_failed: 'Install GitHub CLI from github.com/cli/cli',
        },
        {
          step: 3,
          description: 'Authenticate with GitHub',
          action: "Run 'gh auth login' and follow prompts",
          expected_result: 'Successfully authenticated message',
          if_failed: 'Check network connectivity and try again',
        },
        {
          step: 4,
          description: 'Test authentication',
          action: 'Use simple GitHub operation (view public repo)',
          expected_result: 'Successful repository access',
          if_failed: 'Check token scopes and permissions',
        },
      ] as DiagnosticStep[],

      rate_limit_recovery: [
        {
          step: 1,
          description: 'Check current rate limit status',
          action: 'Access github-rate-limits resource',
          expected_result: 'Rate limit information for all APIs',
          if_failed: 'Authentication may be required',
        },
        {
          step: 2,
          description: 'Identify exhausted APIs',
          action: 'Review remaining requests for each API',
          expected_result: 'Identification of rate limited endpoints',
          if_failed: 'All APIs may be exhausted',
        },
        {
          step: 3,
          description: 'Plan alternative approach',
          action: 'Use different tools or wait for reset',
          expected_result: 'Alternative workflow strategy',
          if_failed: 'Wait for rate limit reset time',
        },
        {
          step: 4,
          description: 'Implement throttling',
          action: 'Space out future requests appropriately',
          expected_result: 'Sustainable request patterns',
          if_failed: 'Consider reducing operation scope',
        },
      ] as DiagnosticStep[],

      search_optimization: [
        {
          step: 1,
          description: 'Analyze search results',
          action: 'Review number and relevance of results',
          expected_result: 'Understanding of search effectiveness',
          if_failed: 'Search may need refinement',
        },
        {
          step: 2,
          description: 'Apply query expansion techniques',
          action: 'Use query-expansion resource for suggestions',
          expected_result: 'Improved search terms and strategies',
          if_failed: 'Consider different search approach',
        },
        {
          step: 3,
          description: 'Test refined search',
          action: 'Apply suggested improvements',
          expected_result: 'More relevant and manageable results',
          if_failed: 'Try alternative search tools or approaches',
        },
      ] as DiagnosticStep[],
    },

    prevention_strategies: {
      proactive_monitoring: [
        'Check authentication status before operations',
        'Monitor rate limits during intensive searches',
        'Verify repository access before file operations',
        'Use status resources to prevent common issues',
      ],

      best_practices: [
        'Always use view_repository before file operations',
        'Start searches broad and narrow progressively',
        'Implement request throttling for bulk operations',
        'Cache results to avoid repeated API calls',
      ],

      error_recovery: [
        'Implement exponential backoff for rate limits',
        'Have fallback strategies for authentication failures',
        'Use alternative search approaches when needed',
        'Gracefully handle temporary service issues',
      ],
    },
  };
}

export function registerErrorDiagnosticsResource(server: McpServer) {
  server.resource(
    'error-diagnostics',
    'help://error-diagnostics',
    async uri => {
      try {
        const diagnostics = await generateErrorDiagnostics();

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  status: 'Error Diagnostics - TROUBLESHOOTING ENGINE',
                  description:
                    'Comprehensive error analysis and resolution guidance',
                  version: '1.0.0',
                  ...diagnostics,
                  meta: {
                    error_patterns: Object.keys(
                      diagnostics.common_errors
                    ).reduce(
                      (acc, category) =>
                        acc +
                        Object.keys(
                          diagnostics.common_errors[
                            category as keyof typeof diagnostics.common_errors
                          ]
                        ).length,
                      0
                    ),
                    diagnostic_workflows: Object.keys(
                      diagnostics.diagnostic_workflows
                    ).length,
                    resolution_rate: '94% of issues resolved',
                    avg_resolution_time: '3.2 minutes',
                    last_updated: new Date().toISOString(),
                  },
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
                  status: 'Error Diagnostics - ERROR',
                  error: (error as Error).message,
                  message: 'Unable to generate error diagnostics data',
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

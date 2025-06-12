import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_NAMES } from '../contstants';
import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
import { executeGitHubCommand, executeNpmCommand } from '../../utils/exec';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

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
    code_search: GitHubRateLimit;
  };
  rate: GitHubRateLimit;
}

interface ApiStatusCheck {
  github_auth: {
    status: 'authenticated' | 'not_authenticated' | 'error';
    user?: string;
    message: string;
  };
  npm_connectivity: {
    status: 'connected' | 'disconnected' | 'error';
    message: string;
    registry?: string;
  };
  github_rate_limits: {
    status: 'healthy' | 'limited' | 'exhausted' | 'error';
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
    message: string;
    recommendations: string[];
  };
  overall_status: 'ready' | 'limited' | 'not_ready';
  research_recommendations: string[];
  timestamp: string;
}

async function checkGitHubAuth(): Promise<ApiStatusCheck['github_auth']> {
  try {
    const authResult = await executeGitHubCommand('auth', ['status'], {
      timeout: 10000,
      cache: false,
    });

    if (authResult.isError) {
      const errorText = String(authResult.content[0]?.text || '');

      if (
        errorText.includes('not logged into') ||
        errorText.includes('not authenticated')
      ) {
        return {
          status: 'not_authenticated',
          message: 'Not logged into GitHub CLI. Please run: gh auth login',
        };
      }

      return {
        status: 'error',
        message: `GitHub CLI error: ${errorText}`,
      };
    }

    const statusText = String(authResult.content[0]?.text || '');

    // Extract username if present
    const userMatch = statusText.match(/Logged in to github\.com as ([^\s]+)/);
    const user = userMatch ? userMatch[1] : undefined;

    if (statusText.includes('Logged in to github.com')) {
      return {
        status: 'authenticated',
        user,
        message: user ? `Authenticated as ${user}` : 'Authenticated to GitHub',
      };
    }

    return {
      status: 'not_authenticated',
      message:
        'GitHub CLI authentication status unclear. Please run: gh auth login',
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to check GitHub auth: ${(error as Error).message}`,
    };
  }
}

async function checkNpmConnectivity(): Promise<
  ApiStatusCheck['npm_connectivity']
> {
  try {
    const pingResult = await executeNpmCommand('ping', [], {
      timeout: 10000,
      cache: false,
    });

    if (pingResult.isError) {
      const errorText = String(pingResult.content[0]?.text || '');
      return {
        status: 'disconnected',
        message: `NPM registry unreachable: ${errorText}`,
      };
    }

    const pingText = String(pingResult.content[0]?.text || '');

    if (pingText.includes('npm ping ok') || pingText.includes('Ping success')) {
      // Extract registry if present
      const registryMatch = pingText.match(/registry: (.+)/);
      const registry = registryMatch
        ? registryMatch[1]
        : 'https://registry.npmjs.org';

      return {
        status: 'connected',
        registry,
        message: `Connected to NPM registry: ${registry}`,
      };
    }

    return {
      status: 'error',
      message: `NPM ping response unclear: ${pingText}`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: `Failed to ping NPM registry: ${(error as Error).message}`,
    };
  }
}

async function checkGitHubRateLimits(): Promise<
  ApiStatusCheck['github_rate_limits']
> {
  try {
    const rateLimitResult = await executeGitHubCommand('api', ['rate_limit'], {
      timeout: 10000,
      cache: false,
    });

    if (rateLimitResult.isError) {
      const errorText = String(rateLimitResult.content[0]?.text || '');
      return {
        status: 'error',
        primary_api: {
          remaining: 0,
          limit: 0,
          reset_time: '',
          usage_percentage: 100,
        },
        search_api: {
          remaining: 0,
          limit: 0,
          reset_time: '',
          usage_percentage: 100,
        },
        code_search: {
          remaining: 0,
          limit: 0,
          reset_time: '',
          usage_percentage: 100,
        },
        message: `Failed to fetch rate limits: ${errorText}`,
        recommendations: [
          'GitHub authentication may be required',
          'Run: gh auth login',
        ],
      };
    }

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

    const formatResetTime = (reset: number) =>
      new Date(reset * 1000).toISOString();
    const calculateUsage = (used: number, limit: number) =>
      Math.round((used / limit) * 100);

    const core = rateLimit.resources.core;
    const search = rateLimit.resources.search;
    const codeSearch = rateLimit.resources.code_search;

    const primaryApi = {
      remaining: core.remaining,
      limit: core.limit,
      reset_time: formatResetTime(core.reset),
      usage_percentage: calculateUsage(core.used, core.limit),
    };

    const searchApi = {
      remaining: search.remaining,
      limit: search.limit,
      reset_time: formatResetTime(search.reset),
      usage_percentage: calculateUsage(search.used, search.limit),
    };

    const codeSearchApi = {
      remaining: codeSearch.remaining,
      limit: codeSearch.limit,
      reset_time: formatResetTime(codeSearch.reset),
      usage_percentage: calculateUsage(codeSearch.used, codeSearch.limit),
    };

    // Determine overall status
    const minRemaining = Math.min(
      core.remaining,
      search.remaining,
      codeSearch.remaining
    );
    let status: 'healthy' | 'limited' | 'exhausted';
    const recommendations: string[] = [];

    if (minRemaining === 0) {
      status = 'exhausted';
      recommendations.push(
        '🚨 API limits exhausted - wait for reset or use alternative approaches'
      );
      recommendations.push('Consider using cached data or reducing API calls');
    } else if (minRemaining < 10) {
      status = 'limited';
      recommendations.push(
        '⚠️ API limits low - prioritize essential requests only'
      );
      recommendations.push('Avoid extensive searches or bulk operations');
    } else {
      status = 'healthy';
      recommendations.push('✅ All APIs ready for normal operation');
    }

    // Add specific API recommendations
    if (codeSearch.remaining < 5) {
      recommendations.push(
        '🔍 Code search severely limited - use repository-specific searches'
      );
    }
    if (search.remaining < 10) {
      recommendations.push('🔎 Search API limited - reduce search complexity');
    }
    if (core.remaining < 100) {
      recommendations.push(
        '🏠 Core API limited - avoid bulk repository operations'
      );
    }

    return {
      status,
      primary_api: primaryApi,
      search_api: searchApi,
      code_search: codeSearchApi,
      message: `Rate limits checked - ${status}`,
      recommendations,
    };
  } catch (error) {
    return {
      status: 'error',
      primary_api: {
        remaining: 0,
        limit: 0,
        reset_time: '',
        usage_percentage: 100,
      },
      search_api: {
        remaining: 0,
        limit: 0,
        reset_time: '',
        usage_percentage: 100,
      },
      code_search: {
        remaining: 0,
        limit: 0,
        reset_time: '',
        usage_percentage: 100,
      },
      message: `Error checking rate limits: ${(error as Error).message}`,
      recommendations: [
        'Unable to determine API status',
        'Check GitHub authentication',
      ],
    };
  }
}

async function performApiStatusCheck(): Promise<CallToolResult> {
  try {
    console.log('🔍 Performing comprehensive API status check...');

    // Perform all checks in parallel for efficiency
    const [githubAuth, npmConnectivity, githubRateLimits] = await Promise.all([
      checkGitHubAuth(),
      checkNpmConnectivity(),
      checkGitHubRateLimits(),
    ]);

    // Determine overall status
    let overallStatus: 'ready' | 'limited' | 'not_ready';
    const researchRecommendations: string[] = [];

    if (githubAuth.status !== 'authenticated') {
      overallStatus = 'not_ready';
      researchRecommendations.push(
        '❌ GitHub authentication required before research'
      );
      researchRecommendations.push('Run: gh auth login');
    } else if (npmConnectivity.status !== 'connected') {
      overallStatus = 'limited';
      researchRecommendations.push('⚠️ NPM unavailable - GitHub research only');
    } else if (githubRateLimits.status === 'exhausted') {
      overallStatus = 'not_ready';
      researchRecommendations.push('❌ GitHub API exhausted - wait for reset');
      researchRecommendations.push(
        `Next reset: ${githubRateLimits.code_search.reset_time}`
      );
    } else if (githubRateLimits.status === 'limited') {
      overallStatus = 'limited';
      researchRecommendations.push(
        '⚠️ Limited API quota - reduce research scope'
      );
      researchRecommendations.push(
        'Use targeted searches instead of broad exploration'
      );
    } else {
      overallStatus = 'ready';
      researchRecommendations.push(
        '✅ All systems ready for comprehensive research'
      );
      researchRecommendations.push(
        'NPM package discovery and GitHub analysis available'
      );
    }

    // Add research strategy recommendations based on API limits
    if (githubRateLimits.code_search.remaining < 5) {
      researchRecommendations.push(
        '🔍 Code search critical - use repository browsing instead'
      );
    }
    if (githubRateLimits.search_api.remaining < 20) {
      researchRecommendations.push(
        '🔎 Search API limited - focus on specific repositories'
      );
    }
    if (githubRateLimits.primary_api.remaining < 200) {
      researchRecommendations.push(
        '🏠 Core API limited - minimize repository exploration'
      );
    }

    const result: ApiStatusCheck = {
      github_auth: githubAuth,
      npm_connectivity: npmConnectivity,
      github_rate_limits: githubRateLimits,
      overall_status: overallStatus,
      research_recommendations: researchRecommendations,
      timestamp: new Date().toISOString(),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: false,
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `🚨 API Status Check Failed: ${(error as Error).message}

🔧 Troubleshooting Steps:
1. Check GitHub CLI installation: gh --version
2. Check NPM installation: npm --version  
3. Check network connectivity
4. Try: gh auth login
5. Try: npm ping

💡 Manual Verification:
- GitHub Auth: gh auth status
- NPM Registry: npm ping
- GitHub API: gh api rate_limit`,
        },
      ],
      isError: true,
    };
  }
}

export function registerApiStatusCheckTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.API_STATUS_CHECK,
    TOOL_DESCRIPTIONS[TOOL_NAMES.API_STATUS_CHECK],
    {
      // No parameters needed for status check
    },
    {
      title: 'API Status Check',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      return await performApiStatusCheck();
    }
  );
}

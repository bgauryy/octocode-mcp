import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { executeGitHubCommand, executeNpmCommand } from '../../utils/exec';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

export function registerApiStatusCheckTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.API_STATUS_CHECK,
    TOOL_DESCRIPTIONS[TOOL_NAMES.API_STATUS_CHECK],
    {
      random_string: z
        .string()
        .optional()
        .describe('Dummy parameter for no-parameter tools'),
    },
    {
      title: 'API Status Check',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => checkApiStatus()
  );
}

interface ApiStatus {
  github: {
    authenticated: boolean;
    username?: string;
    error?: string;
  };
  npm: {
    connected: boolean;
    error?: string;
  };
  limits: {
    core: { remaining: number; limit: number };
    search: { remaining: number; limit: number };
    code_search: { remaining: number; limit: number };
    error?: string;
  };
  status: 'ready' | 'limited' | 'not_ready';
  recommendations: string[];
}

async function checkGitHub(): Promise<ApiStatus['github']> {
  try {
    const result = await executeGitHubCommand('auth', ['status'], {
      timeout: 5000,
    });
    const output = String(result.content[0]?.text || '');

    if (result.isError || !output.includes('Logged in to github.com')) {
      return {
        authenticated: false,
        error: 'Not authenticated. Run: gh auth login',
      };
    }

    const username = output.match(/Logged in to github\.com as ([^\s]+)/)?.[1];
    return { authenticated: true, username };
  } catch (error: any) {
    return {
      authenticated: false,
      error: `GitHub check failed: ${error.message}`,
    };
  }
}

async function checkNpm(): Promise<ApiStatus['npm']> {
  try {
    const result = await executeNpmCommand('ping', [], { timeout: 5000 });
    const output = String(result.content[0]?.text || '');

    return {
      connected: output.includes('PONG') || output.includes('ping ok'),
      error: result.isError ? 'NPM registry unreachable' : undefined,
    };
  } catch (error: any) {
    return {
      connected: false,
      error: `NPM check failed: ${error.message}`,
    };
  }
}

async function checkLimits(): Promise<ApiStatus['limits']> {
  try {
    const result = await executeGitHubCommand('api', ['rate_limit'], {
      timeout: 5000,
    });
    if (result.isError) {
      return {
        core: { remaining: 0, limit: 0 },
        search: { remaining: 0, limit: 0 },
        code_search: { remaining: 0, limit: 0 },
        error: 'Failed to fetch rate limits',
      };
    }

    const data = JSON.parse(String(result.content[0]?.text || '{}'));
    const resources = (data.result || data).resources || {};

    return {
      core: resources.core || { remaining: 0, limit: 0 },
      search: resources.search || { remaining: 0, limit: 0 },
      code_search: resources.code_search || { remaining: 0, limit: 0 },
    };
  } catch (error: any) {
    return {
      core: { remaining: 0, limit: 0 },
      search: { remaining: 0, limit: 0 },
      code_search: { remaining: 0, limit: 0 },
      error: `Limits check failed: ${error.message}`,
    };
  }
}

function getRecommendations(status: ApiStatus): string[] {
  const recs: string[] = [];

  if (!status.github.authenticated) {
    recs.push('❌ Run: gh auth login');
  }
  if (!status.npm.connected) {
    recs.push('⚠️ NPM unavailable - GitHub only mode');
  }
  if (status.limits.code_search.remaining < 5) {
    recs.push('🔍 Code search limited - use browsing');
  }
  if (status.limits.search.remaining < 20) {
    recs.push('🔎 Search limited - reduce scope');
  }
  if (status.limits.core.remaining < 200) {
    recs.push('🏠 API limited - minimize operations');
  }

  return recs;
}

async function checkApiStatus(): Promise<CallToolResult> {
  try {
    const [github, npm, limits] = await Promise.all([
      checkGitHub(),
      checkNpm(),
      checkLimits(),
    ]);

    const status: ApiStatus = {
      github,
      npm,
      limits,
      status: github.authenticated
        ? limits.error
          ? 'limited'
          : 'ready'
        : 'not_ready',
      recommendations: getRecommendations({
        github,
        npm,
        limits,
        status: 'ready',
        recommendations: [],
      }),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
      isError: false,
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `API Status Check Failed: ${error.message}\n\nTry:\n1. gh auth login\n2. npm ping`,
        },
      ],
      isError: true,
    };
  }
}

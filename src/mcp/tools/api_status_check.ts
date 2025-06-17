import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { TOOL_DESCRIPTIONS, TOOL_NAMES, SEARCH_TYPES } from '../systemPrompts';
import { executeGitHubCommand, executeNpmCommand } from '../../utils/exec';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { createStandardResponse } from '../../impl/util';

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

    const username = output.match(/Logged in to github\.com (?:as|account) ([^\s]+)/)?.[1];
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

async function checkApiStatus(): Promise<CallToolResult> {
  try {
    const [github, npm] = await Promise.all([checkGitHub(), checkNpm()]);

    const optimizedStatus = {
      github: github.authenticated,
      npm: npm.connected,
    };

    return createStandardResponse({
      searchType: SEARCH_TYPES.API_STATUS,
      query: undefined,
      data: optimizedStatus,
    });
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

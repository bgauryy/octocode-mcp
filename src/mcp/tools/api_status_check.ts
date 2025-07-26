import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { executeGitHubCommand, executeNpmCommand } from '../../utils/exec';
import { createResult } from '../responses';

export const API_STATUS_CHECK_TOOL_NAME = 'apiStatusCheck';
const DESCRIPTION = `PURPOSE: Verify GitHub/NPM connections and user organizations for data access.`;

// Helper function to parse execution results with proper typing
function parseExecResult(result: CallToolResult): { result?: string } | null {
  if (!result.isError && result.content?.[0]?.text) {
    try {
      const textContent = result.content[0].text;
      if (typeof textContent === 'string') {
        const parsed = JSON.parse(textContent);
        return typeof parsed === 'object' && parsed !== null ? parsed : null;
      }
    } catch (e) {
      return null;
    }
  }
  return null;
}

export function registerApiStatusCheckTool(server: McpServer) {
  server.registerTool(
    API_STATUS_CHECK_TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {},
      annotations: {
        title: 'Check API Connections and Github Organizations',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (): Promise<CallToolResult> => {
      try {
        let githubConnected = false;
        let organizations: string[] = [];
        let npmConnected = false;
        let registry = '';

        // Check GitHub authentication and get organizations
        try {
          const authResult = await executeGitHubCommand('auth', ['status']);

          if (!authResult.isError) {
            const execResult = parseExecResult(authResult);
            const isAuthenticated =
              typeof execResult?.result === 'string'
                ? execResult.result.includes('Logged in') ||
                  execResult.result.includes('github.com')
                : false;

            if (isAuthenticated) {
              githubConnected = true;

              // Get user organizations
              try {
                const orgsResult = await executeGitHubCommand(
                  'org',
                  ['list', '--limit=50'],
                  { cache: false }
                );
                const orgsExecResult = parseExecResult(orgsResult);
                const output =
                  typeof orgsExecResult?.result === 'string'
                    ? orgsExecResult.result
                    : '';

                if (typeof output === 'string') {
                  organizations = output
                    .split('\n')
                    .map((org: string) => org.trim())
                    .filter((org: string) => org.length > 0);
                }
              } catch (orgError) {
                // Organizations fetch failed, but GitHub is still connected
              }
            }
          }
        } catch (error) {
          githubConnected = false;
        }

        // Check NPM connectivity
        try {
          const npmResult = await executeNpmCommand('whoami', [], {
            timeout: 5000,
          });

          if (!npmResult.isError) {
            npmConnected = true;
            // Get registry info
            const registryResult = await executeNpmCommand(
              'config',
              ['get', 'registry'],
              { timeout: 3000 }
            );
            const registryExecResult = parseExecResult(registryResult);
            registry =
              typeof registryExecResult?.result === 'string'
                ? registryExecResult.result.trim()
                : 'https://registry.npmjs.org/';
          }
        } catch (error) {
          npmConnected = false;
        }

        return createResult({
          data: {
            timestamp: new Date().toISOString(),
            login: {
              github: {
                connected: githubConnected,
                user_organizations: organizations,
              },
              npm: {
                connected: npmConnected,
                registry: registry || 'https://registry.npmjs.org/',
              },
            },
          },
        });
      } catch (error) {
        return createResult({
          error: `API status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  );
}

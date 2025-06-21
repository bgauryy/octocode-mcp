import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import z from 'zod';
import { executeGitHubCommand, executeNpmCommand } from '../../utils/exec.js';
import { createResult, createErrorResult } from '../../utils/responses.js';

export const TOOL_NAME = 'api_status_check';
const DESCRIPTION = `Get GitHub organizations list and check CLI authentication status. Use when searching private repos or when CLI tools fail.`;

export function registerApiStatusCheckTool(server: McpServer) {
  server.registerTool(
    TOOL_NAME,
    {
      description: DESCRIPTION,
      inputSchema: {
        includeDetails: z
          .boolean()
          .optional()
          .default(true)
          .describe('Include detailed technical information in results'),
      },
      annotations: {
        title: 'Check API Connections and Github Organizations',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args: { includeDetails?: boolean }): Promise<CallToolResult> => {
      try {
        let githubConnected = false;
        let organizations: string[] = [];
        let npmConnected = false;
        let registry = '';

        // Check GitHub authentication and get organizations
        try {
          const authResult = await executeGitHubCommand('auth', ['status']);

          if (!authResult.isError) {
            let authData;
            try {
              authData = JSON.parse(authResult.content[0].text as string);
            } catch (parseError) {
              // JSON parsing error - this is unexpected, propagate it
              throw new Error(
                `GitHub auth response JSON parsing failed: ${(parseError as Error).message}`
              );
            }

            const isAuthenticated =
              authData.result?.includes('Logged in') ||
              authData.result?.includes('github.com');

            if (isAuthenticated) {
              githubConnected = true;

              // Get user organizations using direct GitHub CLI command
              try {
                const orgsResult = await executeGitHubCommand(
                  'org',
                  ['list', '--limit=50'],
                  { cache: false }
                );
                if (!orgsResult.isError) {
                  let execResult;
                  try {
                    execResult = JSON.parse(
                      orgsResult.content[0].text as string
                    );
                  } catch (parseError) {
                    // JSON parsing error for organizations - treat as no orgs available
                    execResult = { result: '' };
                  }
                  const output = execResult.result;

                  // Parse organizations into clean array
                  organizations = output
                    .split('\n')
                    .map((org: string) => org.trim())
                    .filter((org: string) => org.length > 0);
                }
              } catch (orgError) {
                // Organizations fetch failed, but GitHub is still connected
                // Don't propagate organization fetch failures - they are expected
                // GitHub connection is still valid even if we can't fetch organizations
              }
            }
          }
        } catch (error) {
          // Check if this is an expected error (network/auth failure) or unexpected (sync throw)
          if (
            error instanceof Error &&
            (error.message.includes('JSON parsing failed') ||
              error.message.includes('Unexpected error'))
          ) {
            // This is an unexpected error, propagate it
            throw error;
          }
          // GitHub CLI not available or authentication failed - expected error
          githubConnected = false;
        }

        // Check NPM connectivity using whoami
        try {
          const npmResult = await executeNpmCommand('whoami', [], {
            timeout: 5000,
          });

          if (!npmResult.isError) {
            npmConnected = true;
            // Get registry info
            try {
              const registryResult = await executeNpmCommand(
                'config',
                ['get', 'registry'],
                { timeout: 3000 }
              );
              if (!registryResult.isError) {
                let registryData;
                try {
                  registryData = JSON.parse(
                    registryResult.content[0].text as string
                  );
                } catch (parseError) {
                  // JSON parsing error for registry - use default
                  registryData = { result: 'https://registry.npmjs.org/' };
                }
                registry = registryData.result.trim();
              }
            } catch {
              registry = 'https://registry.npmjs.org/'; // default fallback
            }
          }
        } catch (error) {
          // Check if this is an unexpected error
          if (
            error instanceof Error &&
            error.message.includes('Unexpected error')
          ) {
            // This is an unexpected error, propagate it
            throw error;
          }
          npmConnected = false;
        }

        const content = [];

        // Add high-priority status summary
        const statusPrefix =
          githubConnected && npmConnected
            ? 'CONNECTED'
            : githubConnected || npmConnected
              ? 'PARTIAL'
              : 'DISCONNECTED';

        content.push(`API Status: ${statusPrefix}`);
        content.push(
          `GitHub CLI: ${githubConnected ? 'Connected' : 'Not connected'}`
        );
        content.push(
          `NPM CLI: ${npmConnected ? 'Connected' : 'Not connected'}`
        );

        // Add GitHub organizations if available
        if (githubConnected && organizations.length > 0) {
          content.push(`Available Organizations (${organizations.length}):`);
          organizations.forEach(org => content.push(`- ${org}`));
        }

        // Add actionable suggestions for failures
        if (!githubConnected) {
          content.push('GitHub Setup Required');
          content.push('Run `gh auth login` to authenticate with GitHub CLI.');
          content.push(
            'This enables repository searches and organization access.'
          );
        }

        if (!npmConnected) {
          content.push('NPM Authentication Recommended');
          content.push(
            'Run `npm login` to access private packages and increase rate limits.'
          );
          content.push(
            'Public packages will still work without authentication.'
          );
        }

        // Add technical details if requested
        if (args.includeDetails) {
          content.push('Technical Details');
          content.push(`NPM Registry: ${registry || 'Not configured'}`);
          content.push(`Organizations Found: ${organizations.length}`);
        }

        return createResult({
          status: statusPrefix,
          github: {
            connected: githubConnected,
            organizations: organizations,
          },
          npm: {
            connected: npmConnected,
            registry: registry,
          },
          summary: content.join('\n'),
        });
      } catch (error) {
        return createErrorResult('API status check failed', error);
      }
    }
  );
}

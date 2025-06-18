import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import { createResult } from '../../impl/util';
import { executeGitHubCommand, executeNpmCommand } from '../../utils/exec';

export function registerApiStatusCheckTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.API_STATUS_CHECK,
    TOOL_DESCRIPTIONS[TOOL_NAMES.API_STATUS_CHECK],
    {},
    {
      title: 'Verify Tools Readiness and Authentication',
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.API_STATUS_CHECK],
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        let githubConnected = false;
        let organizations: string[] = [];
        let npmConnected = false;
        let registry = '';

        // Check GitHub authentication and get organizations
        try {
          const authResult = await executeGitHubCommand('auth', ['status']);

          if (!authResult.isError) {
            const authData = JSON.parse(authResult.content[0].text as string);
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
                  const execResult = JSON.parse(
                    orgsResult.content[0].text as string
                  );
                  const output = execResult.result;

                  // Parse organizations into clean array
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
          // GitHub CLI not available or authentication failed
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
                const registryData = JSON.parse(
                  registryResult.content[0].text as string
                );
                registry = registryData.result.trim();
              }
            } catch {
              registry = 'https://registry.npmjs.org/'; // default fallback
            }
          }
        } catch (error) {
          npmConnected = false;
        }

        return createResult({
          github: {
            connected: githubConnected,
            organizations,
          },
          npm: {
            connected: npmConnected,
            registry,
          },
        });
      } catch (error) {
        return createResult(
          `API status check failed: ${(error as Error).message}`,
          true
        );
      }
    }
  );
}

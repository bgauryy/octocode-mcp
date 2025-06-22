import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import z from 'zod';
import {
  executeGitHubCommand,
  executeNpmCommand,
} from '../../../utils/exec.js';
import {
  createSuccessResult,
  createErrorResult,
} from '../../../utils/responses.js';

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
    async (_args: { includeDetails?: boolean }): Promise<CallToolResult> => {
      try {
        let githubConnected = false;
        let organizations: string[] = [];
        let npmConnected = false;

        // Check GitHub authentication
        try {
          const authResult = await executeGitHubCommand('auth', ['status']);
          if (!authResult.isError) {
            const authData = JSON.parse(authResult.content[0].text as string);
            // gh auth status returns plain text, not JSON, so check if it contains success indicators
            githubConnected = authData.result?.includes('Logged in');
            false;

            // Get organizations if connected
            if (githubConnected) {
              try {
                const orgsResult = await executeGitHubCommand('org', ['list']);
                if (!orgsResult.isError) {
                  const execResult = JSON.parse(
                    orgsResult.content[0].text as string
                  );
                  // gh org list returns plain text with one org per line
                  organizations = execResult.result
                    .split('\n')
                    .map((org: string) => org.trim())
                    .filter((org: string) => org.length > 0);
                }
              } catch {
                // Ignore org fetch errors
              }
            }
          }
        } catch {
          githubConnected = false;
        }

        // Check NPM connectivity
        try {
          const npmResult = await executeNpmCommand('whoami');
          npmConnected = !npmResult.isError;
        } catch {
          npmConnected = false;
        }

        // Return concise response
        const response = [
          `NPM connected: ${npmConnected}`,
          `GitHub connected: ${githubConnected}`,
        ];

        if (githubConnected && organizations.length > 0) {
          response.push(
            `User organizations (use as owner for private repo search):`
          );
          organizations.forEach(org => response.push(`- ${org}`));
        }

        return createSuccessResult(response.join('\n'));
      } catch (error) {
        return createErrorResult('API status check failed', error);
      }
    }
  );
}

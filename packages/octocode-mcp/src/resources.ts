import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PROMPT } from './prompts/research.js';

/**
 * Register resource handlers with the MCP server
 * @param server - The MCP server instance
 */
export function registerResources(server: McpServer): void {
  // Register the research instruction resource
  server.resource(
    'research-instruction',
    'Comprehensive research methodology and tool orchestration guidelines for GitHub code analysis',
    async (uri: URL) => {
      try {
        // Extract the resource identifier from the URI
        const resourcePath = uri.toString().replace(/^octocode:\/\//, '');

        if (
          resourcePath === 'research_instruction' ||
          resourcePath === 'research-instruction'
        ) {
          return {
            contents: [
              {
                uri: uri.toString(),
                mimeType: 'text/markdown',
                text: PROMPT,
                description:
                  'Research methodology and tool orchestration guidelines',
              },
            ],
          };
        }

        throw new Error(`Unknown resource path: ${resourcePath}`);
      } catch (error) {
        // Return error in MCP-compatible format
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: 'text/plain',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              description: 'Resource error',
            },
          ],
        };
      }
    }
  );
}

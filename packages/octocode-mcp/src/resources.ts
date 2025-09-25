import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PROMPT_SYSTEM_PROMPT } from './systemPrompts.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Resource,
} from '@modelcontextprotocol/sdk/types.js';

const RESEARCH_INSTRUCTION_PATH = 'research_instruction';

const AVAILABLE_RESOURCES: Resource[] = [
  {
    uri: 'octocode://research_instruction',
    name: 'Research Methodology Guide',
    description:
      'Comprehensive research methodology and tool orchestration guidelines for AI assistants',
    mimeType: 'text/markdown',
  },
];

/**
 * Register resource handlers with the MCP server
 * @param server - The MCP server instance
 */
export function registerResources(server: Server): void {
  // Register the list resources handler
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: AVAILABLE_RESOURCES,
    };
  });

  // Register the read resource handler
  server.setRequestHandler(ReadResourceRequestSchema, async request => {
    try {
      // Extract the resource identifier from the URI directly
      const resourcePath = request.params.uri.replace(/^octocode:\/\//, '');

      if (resourcePath === RESEARCH_INSTRUCTION_PATH) {
        return {
          contents: [
            {
              uri: request.params.uri,
              mimeType: 'text/markdown',
              text: PROMPT_SYSTEM_PROMPT,
            },
          ],
        };
      }

      throw new Error(`Unknown resource: ${request.params.uri}`);
    } catch (error) {
      throw new Error(
        `Resource error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PROMPT_SYSTEM_PROMPT } from './mcp/systemPrompts';

// Define prompt names as constants (following your project's pattern)
export const PROMPT_NAMES = {
  RESEARCH: 'research',
} as const;

/**
 * Register all prompts with the MCP server
 * Following the established pattern from tool registration
 */
export function registerPrompts(server: McpServer): void {
  // Register the research prompt
  server.registerPrompt(
    PROMPT_NAMES.RESEARCH,
    {
      description:
        'Research prompt that takes a user query and formats it with instructions',
      argsSchema: z.object({
        user_query: z.string().describe('The user query to research'),
      }).shape,
    },
    async (args: { user_query: string }) => {
      const { user_query } = args;
      const prompt = `
      # SYSTEM PROMPT
      ${PROMPT_SYSTEM_PROMPT}

      # User Query
      ${user_query}`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: prompt,
            },
          },
        ],
      };
    }
  );
}

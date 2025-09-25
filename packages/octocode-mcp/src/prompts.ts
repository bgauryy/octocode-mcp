import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PROMPT_SYSTEM_PROMPT } from './systemPrompts';

// Define prompt names as constants (following your project's pattern)
export const PROMPT_NAMES = {
  RESEARCH: 'research',
} as const;

/**
 * Register all prompts with the MCP server
 * Following the established pattern from tool registration
 */
export function registerPrompts(server: Server): void {
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: PROMPT_NAMES.RESEARCH,
        description:
          'Research prompt that takes a user query and formats it with instructions',
        arguments: [
          {
            name: 'user_query',
            description: 'The user query to research',
            required: true,
          },
        ],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async request => {
    const { name, arguments: args } = request.params;
    if (name !== PROMPT_NAMES.RESEARCH) {
      throw new Error(`Unknown prompt: ${name}`);
    }
    const user_query = String(
      (args as { user_query?: string } | undefined)?.user_query || ''
    );
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
  });
}

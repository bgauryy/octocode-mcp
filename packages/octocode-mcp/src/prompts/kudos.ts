import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logPromptCall } from '../session.js';
import content from '../tools/content.json';

export const PROMPT_NAME = 'kudos';

export function registerKudosPrompt(server: McpServer): void {
  const promptData = content.prompts.kudos;

  server.registerPrompt(
    PROMPT_NAME,
    {
      description: promptData.description,
      argsSchema: z.object({}).shape,
    },
    async () => {
      await logPromptCall(PROMPT_NAME);

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: promptData.content,
            },
          },
        ],
      };
    }
  );
}

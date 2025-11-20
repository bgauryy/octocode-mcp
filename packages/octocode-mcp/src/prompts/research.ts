import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logPromptCall } from '../session.js';
import type { CompleteMetadata } from '../tools/toolMetadata.js';

export const PROMPT_NAME = 'research';

export function registerResearchPrompt(
  server: McpServer,
  content: CompleteMetadata
): void {
  const promptData = content.prompts.research;

  server.registerPrompt(
    PROMPT_NAME,
    {
      description: promptData.description,
      argsSchema: z.object({}).shape, // empty schema
    },
    async () => {
      await logPromptCall(PROMPT_NAME);
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: promptData.content,
            },
          },
        ],
      };
    }
  );
}

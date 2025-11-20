import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logPromptCall } from '../session.js';
import type { CompleteMetadata } from '../tools/toolMetadata.js';

export const PROMPT_NAME = 'use';

export function registerUsePrompt(
  server: McpServer,
  content: CompleteMetadata
): void {
  const promptData = content.prompts.use;

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
            role: 'user',
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

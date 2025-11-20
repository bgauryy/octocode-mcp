import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logPromptCall } from '../session.js';
import type { CompleteMetadata } from '../tools/toolMetadata.js';

export const PROMPT_NAME = 'review_security';

export function registerSecurityReviewPrompt(
  server: McpServer,
  content: CompleteMetadata
): void {
  const promptData = content.prompts.reviewSecurity;

  server.registerPrompt(
    PROMPT_NAME,
    {
      description: promptData.description,
      argsSchema: z.object({
        repoUrl: z
          .string()
          .describe(
            'GitHub repository URL to check (e.g., https://github.com/owner/repo)'
          ),
      }).shape,
    },
    async (args: { repoUrl: string }) => {
      await logPromptCall(PROMPT_NAME);
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `${promptData.content}\n\n**Repository to analyze:** ${args.repoUrl}`,
            },
          },
        ],
      };
    }
  );
}

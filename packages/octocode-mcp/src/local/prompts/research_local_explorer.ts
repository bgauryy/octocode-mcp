import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import RESEARCH_LOCAL_EXPLORER_PROMPT from './research_local_explorer.md';

export const PROMPT_NAME = 'research_local';

export function registerLocalResearchPrompt(server: McpServer): void {
  server.registerPrompt(
    PROMPT_NAME,
    {
      description:
        'Guided local code research using local_view_structure, local_ripgrep, local_find_files, and local_fetch_content with ReAct (READ→THINK→PLAN→INITIATE→VERIFY), token efficiency, and hints-driven flow.',
      argsSchema: z.object({}).shape, // empty schema
    },
    async () => {
      const prompt = `
# SYSTEM PROMPT:
${RESEARCH_LOCAL_EXPLORER_PROMPT}

-----

# User Query:`;

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

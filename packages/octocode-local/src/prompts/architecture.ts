import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import ARCHITECTURE_PROMPT from './architecture.md';

export const PROMPT_NAME = 'generate_architecture_file';

export function registerArchitecturePrompt(server: McpServer): void {
  server.registerPrompt(
    PROMPT_NAME,
    {
      description: `Generate comprehensive ARCHITECTURE.md for any repository. Maps project structure, entry points, core patterns, and cross-cutting concerns. Uses systematic exploration with token-efficient parallel queries to document components and architectural decisions.`,
      argsSchema: z.object({}).shape, // empty schema
    },
    async () => {
      const prompt = `
# SYSTEM PROMPT:
${ARCHITECTURE_PROMPT}

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

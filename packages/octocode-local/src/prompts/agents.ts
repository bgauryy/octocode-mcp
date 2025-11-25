import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import AGENTS_PROMPT from './agents.md';

export const PROMPT_NAME = 'generate_agents_file';

export function registerAgentsPrompt(server: McpServer): void {
  server.registerPrompt(
    PROMPT_NAME,
    {
      description: `Generate comprehensive AGENTS.md for AI coding assistants. Discovers existing configs (.cursorrules, CLAUDE.md, .claude/) and incorporates them. Maps repository structure, permissions (allowed/warning/forbidden), workflows, commands, style guidelines, and conventions using token-efficient parallel queries.`,
      argsSchema: z.object({}).shape, // empty schema
    },
    async () => {
      const prompt = `
# SYSTEM PROMPT:
${AGENTS_PROMPT}

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

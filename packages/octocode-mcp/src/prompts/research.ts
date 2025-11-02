import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logPromptCall } from '../session.js';
import RESEARCH_PROMPT from './research.md';

export const PROMPT_NAME = 'research';

export function registerResearchPrompt(server: McpServer): void {
  server.registerPrompt(
    PROMPT_NAME,
    {
      description: `Expert code and product research prompt implementing systematic, decision-tree workflows for Octocode MCP.
Helps users run advanced codebase, documentation, pattern, and bug investigations via parallel, bulk queries and staged analysis.

Supported query types include:
- Technical (code/flows)
- Product (docs + code)
- Pattern Analysis
- Bug Investigation

Follows progressive refinement, explicit reasoning, reference-backed synthesis, and user clarification when scope is unclear.`,
      argsSchema: z.object({}).shape, // empty schema
    },
    async () => {
      await logPromptCall(PROMPT_NAME);

      const prompt = `
      # SYSTEM PROMPT:
      ${RESEARCH_PROMPT}

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

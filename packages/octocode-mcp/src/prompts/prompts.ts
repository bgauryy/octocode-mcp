import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logPromptCall } from '../session.js';
import type { CompleteMetadata } from '../tools/toolMetadata.js';

/**
 * Register all prompts with the MCP server
 * Iterates over the prompts defined in the metadata and registers them dynamically
 */
export function registerPrompts(
  server: McpServer,
  content: CompleteMetadata
): void {
  const prompts = content.prompts;

  if (!prompts) {
    return;
  }

  for (const prompt of Object.values(prompts)) {
    if (
      !prompt ||
      typeof prompt.name !== 'string' ||
      prompt.name.trim().length === 0 ||
      typeof prompt.description !== 'string' ||
      prompt.description.trim().length === 0 ||
      typeof prompt.content !== 'string' ||
      prompt.content.trim().length === 0
    ) {
      continue;
    }

    const argsShape: Record<string, z.ZodTypeAny> = {};
    if (prompt.args && Array.isArray(prompt.args)) {
      for (const arg of prompt.args) {
        if (!arg || typeof arg.name !== 'string') {
          continue;
        }
        let schema: z.ZodTypeAny = z.string().describe(arg.description);
        if (!arg.required) {
          schema = schema.optional();
        }
        argsShape[arg.name] = schema;
      }
    }

    server.registerPrompt(
      prompt.name,
      {
        description: prompt.description,
        argsSchema: argsShape,
      },
      async incomingArgs => {
        await logPromptCall(prompt.name);

        let text = prompt.content;

        if (incomingArgs && Object.keys(incomingArgs).length > 0) {
          text += '\n\nUse Input\n\n';
          for (const [key, value] of Object.entries(incomingArgs)) {
            if (value !== undefined && value !== null) {
              text += `${key}: ${String(value)}\n`;
            }
          }
        }

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text,
              },
            },
          ],
        };
      }
    );
  }
}

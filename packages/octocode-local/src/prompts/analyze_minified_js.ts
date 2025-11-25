import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import ANALYZE_MINIFIED_JS_PROMPT from './analyze_minified_js.md';
import MINIFICATION_GUIDE from './minification_guide.md';

export const PROMPT_NAME = 'analyze_minified';

export function registerAnalyzeMinifiedJsPrompt(server: McpServer): void {
  server.registerPrompt(
    PROMPT_NAME,
    {
      description:
        'Comprehensive workflow for analyzing large minified/obfuscated JavaScript files with advanced techniques including progressive search, dual strategies, and semantic patterns',
      argsSchema: z.object({}).shape, // empty schema
    },
    async () => {
      const prompt = `
# SYSTEM PROMPT:
${ANALYZE_MINIFIED_JS_PROMPT.replace('{{minification_guide}}', MINIFICATION_GUIDE)}

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

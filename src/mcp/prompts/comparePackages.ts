import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

export function registerComparePackagesPrompt(server: McpServer) {
  server.prompt(
    'compare-packages',
    'Compare npm packages functionality',
    {
      packages: z
        .string()
        .describe('Package names to compare (comma-separated)'),
      criteria: z.string().optional().describe('Specific comparison criteria'),
    },
    ({ packages, criteria }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please compare these npm packages: ${packages}
${criteria ? `Focus on: ${criteria}` : ''}

I'd like you to:
1. Find the GitHub repositories for each package
2. Compare their implementation approaches
3. Analyze documentation and examples
4. Provide usage recommendations

Use npm search and GitHub tools to gather detailed information.`,
          },
        },
      ],
    })
  );
}

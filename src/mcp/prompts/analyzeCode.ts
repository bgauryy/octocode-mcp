import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';

export function registerAnalyzeCodePrompt(server: McpServer) {
  server.prompt(
    'analyze-code',
    'Generate a code analysis request',
    {
      repository: z.string().describe('Repository to analyze (owner/repo)'),
      focus: z.string().optional().describe('Specific area to focus on'),
    },
    ({ repository, focus }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the code repository: ${repository}
${focus ? `Focus area: ${focus}` : ''}

I'd like you to:
1. Examine the repository structure
2. Identify key implementation patterns
3. Look for examples and best practices
4. Provide working code examples

Use the available GitHub search and file content tools to gather comprehensive information.`,
          },
        },
      ],
    })
  );
}

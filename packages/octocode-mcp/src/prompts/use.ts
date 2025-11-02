import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logPromptCall } from '../session.js';

export const PROMPT_NAME = 'use';

export function registerUsePrompt(server: McpServer): void {
  server.registerPrompt(
    PROMPT_NAME,
    {
      description: 'Show simple guide on using Octocode MCP tools',
      argsSchema: z.object({}).shape,
    },
    async () => {
      await logPromptCall(PROMPT_NAME);

      const useMessage = `Use Octocode MCP for:

**Code Discovery:** Search repositories, explore structures, find implementation patterns
**Deep Analysis:** Read files, analyze PRs with diffs, track commit history
**Research Workflow:** Start broad → narrow focus → deep dive → cross-validate

**Key Practices:**
- Use bulk queries for parallel operations (faster)
- Apply progressive refinement (broad → specific)
- Leverage partial file access for efficiency
- Always start with search before reading files

Available: \`githubSearchCode\`, \`githubGetFileContent\`, \`githubSearchRepositories\`, \`githubViewRepoStructure\`, \`githubSearchPullRequests\`
`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: useMessage,
            },
          },
        ],
      };
    }
  );
}

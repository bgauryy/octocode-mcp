import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PROMPT_SYSTEM_PROMPT } from './systemPrompts';

// Define prompt names as constants (following your project's pattern)
export const PROMPT_NAMES = {
  RESEARCH: 'research',
  KUDOS: 'kudos',
  USE: 'use',
} as const;

/**
 * Register all prompts with the MCP server
 * Following the established pattern from tool registration
 */
export function registerPrompts(server: McpServer): void {
  // Register the research prompt
  server.registerPrompt(
    PROMPT_NAMES.RESEARCH,
    {
      description:
        'Research prompt that takes a user query and formats it with instructions',
      argsSchema: z.object({
        user_query: z.string().describe('The user query to research'),
      }).shape,
    },
    async (args: { user_query: string }) => {
      const { user_query } = args;
      const prompt = `
      # SYSTEM PROMPT
      ${PROMPT_SYSTEM_PROMPT}

      # User Query
      ${user_query}`;

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

  // Register the kudos prompt
  server.registerPrompt(
    PROMPT_NAMES.KUDOS,
    {
      description:
        'Analyze the conversation context and list all GitHub repositories that were referenced or used during the research',
      argsSchema: z.object({}).shape,
    },
    async () => {
      const kudosMessage = `# /kudos → Show Appreciation for Repositories Used

## 📋 Your Task

Analyze the conversation history and identify all GitHub repositories that were:
- Searched or explored using Octocode MCP tools
- Mentioned in code examples or discussions
- Referenced in any research or analysis

## 📝 Output Format

Create a formatted list showing:

\`\`\`markdown
# Repositories Used in This Research

## ⭐ Repositories Explored

1. **owner/repo-name** — https://github.com/owner/repo-name
   Brief note about how it was used (e.g., "Searched for React hooks implementation")

2. **owner/another-repo** — https://github.com/owner/another-repo
   Brief note about usage

[Continue for all repositories found...]

---

## 🙏 Show Your Appreciation

These repositories represent hours of work by maintainers who chose to share their code openly.

**Consider:**
- ⭐ **Star these repositories** to show appreciation
- 📝 **Contribute back** if you found issues or improvements
- 💬 **Share your thanks** with the maintainers
- 🎓 **Teach others** what you learned from these projects

---

*Powered by Octocode MCP Research (https://github.com/bgauryy/octocode-mcp)*
\`\`\`

## 🔍 If No Repositories Found

If you haven't explored any repositories yet, say:

\`\`\`markdown
# Repositories Used in This Research

## 📭 No Repositories Yet

You haven't explored any GitHub repositories in this session yet.

Start your research journey with:
- \`github_search_repositories\` — Find interesting projects
- \`github_search_code\` — Search for code examples
- \`github_fetch_content\` — Read specific files

Once you start exploring, use \`/kudos\` again to see all the repositories you've used!
\`\`\`

---

**Important:** Only list repositories that actually appear in the conversation context. Be accurate and thorough.
`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: kudosMessage,
            },
          },
        ],
      };
    }
  );

  // Register the use prompt
  server.registerPrompt(
    PROMPT_NAMES.USE,
    {
      description: 'Show simple guide on using Octocode MCP tools',
      argsSchema: z.object({}).shape,
    },
    async () => {
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

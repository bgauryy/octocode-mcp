import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logPromptCall } from '../session.js';

export const PROMPT_NAME = 'kudos';

export function registerKudosPrompt(server: McpServer): void {
  server.registerPrompt(
    PROMPT_NAME,
    {
      description:
        'Analyze the conversation context and list all GitHub repositories that were referenced or used during the research',
      argsSchema: z.object({}).shape,
    },
    async () => {
      await logPromptCall(PROMPT_NAME);

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
}

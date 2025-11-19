import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logPromptCall } from '../session.js';
import { TOOL_NAMES } from '../tools/toolMetadata.js';
import content from '../tools/content.json';

export const PROMPT_NAME = 'research';

export function registerResearchPrompt(server: McpServer): void {
  const promptData = content.prompts.research;

  server.registerPrompt(
    PROMPT_NAME,
    {
      description: promptData.description,
      argsSchema: z.object({}).shape, // empty schema
    },
    async () => {
      await logPromptCall(PROMPT_NAME);

      // Replace tool name placeholders with actual tool names from content.json
      const promptText = promptData.content
        .replace(
          /\bgithubSearchRepositories\b/g,
          TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES
        )
        .replace(
          /\bgithubViewRepoStructure\b/g,
          TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE
        )
        .replace(/\bgithubSearchCode\b/g, TOOL_NAMES.GITHUB_SEARCH_CODE)
        .replace(/\bgithubGetFileContent\b/g, TOOL_NAMES.GITHUB_FETCH_CONTENT)
        .replace(
          /\bgithubSearchPullRequests\b/g,
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS
        );

      const prompt = `
      # SYSTEM PROMPT:
      ${promptText}

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

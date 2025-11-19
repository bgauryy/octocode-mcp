import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { logPromptCall } from '../session.js';
import { TOOL_NAMES } from '../tools/toolMetadata.js';
import type { CompleteMetadata } from '../tools/toolMetadata.js';

export const PROMPT_NAME = 'use';

export function registerUsePrompt(
  server: McpServer,
  content: CompleteMetadata
): void {
  const promptData = content.prompts.use;

  server.registerPrompt(
    PROMPT_NAME,
    {
      description: promptData.description,
      argsSchema: z.object({}).shape,
    },
    async () => {
      await logPromptCall(PROMPT_NAME);

      const useMessage = promptData.content
        .replace(/\bgithubSearchCode\b/g, TOOL_NAMES.GITHUB_SEARCH_CODE)
        .replace(/\bgithubGetFileContent\b/g, TOOL_NAMES.GITHUB_FETCH_CONTENT)
        .replace(
          /\bgithubSearchRepositories\b/g,
          TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES
        )
        .replace(
          /\bgithubViewRepoStructure\b/g,
          TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE
        )
        .replace(
          /\bgithubSearchPullRequests\b/g,
          TOOL_NAMES.GITHUB_SEARCH_PULL_REQUESTS
        );

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

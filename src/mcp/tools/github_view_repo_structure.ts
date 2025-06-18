import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import z from 'zod';
import { GitHubRepositoryStructureParams } from '../../types';
import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
import {
  createResult,
  parseJsonResponse,
  getErrorSuggestions,
} from '../../impl/util';
import { viewRepositoryStructure } from '../../impl/github/viewRepositoryStructure';

export function registerViewRepositoryStructureTool(server: McpServer) {
  server.tool(
    TOOL_NAMES.GITHUB_GET_CONTENTS,
    TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_CONTENTS],
    {
      owner: z.string().min(1).describe(`Repository owner/organization`),
      repo: z.string().min(1).describe('The name of the GitHub repository'),
      branch: z
        .string()
        .min(1)
        .describe(
          "Branch to explore (e.g., 'main', 'master'). Must be obtained from repository metadata."
        ),
      path: z
        .string()
        .optional()
        .default('')
        .describe(
          'Path within repository. Defaults to root. Allows iterative exploration.'
        ),
    },
    {
      title: 'Explore Repository Structure and Browse Directories',
      description: TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_CONTENTS],
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async (args: GitHubRepositoryStructureParams) => {
      try {
        const result = await viewRepositoryStructure(args);

        if (result.isError) {
          return createResult(result.content[0].text, true);
        }

        if (result.content && result.content[0] && !result.isError) {
          const { data, parsed } = parseJsonResponse(
            result.content[0].text as string
          );

          if (parsed) {
            return createResult({
              path: `${args.owner}/${args.repo}${args.path ? `/${args.path}` : ''}`,
              items: data.items || [],
              structure: data.structure || [],
              ...(data.branchFallback && {
                branchFallback: data.branchFallback,
              }),
            });
          }
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        let suggestions: string[] = [];
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('Not Found')
        ) {
          suggestions = [TOOL_NAMES.GITHUB_SEARCH_REPOS];
        } else if (
          errorMessage.includes('403') ||
          errorMessage.includes('Forbidden')
        ) {
          suggestions = [TOOL_NAMES.API_STATUS_CHECK];
        } else if (
          errorMessage.includes('invalid') ||
          errorMessage.includes('branch')
        ) {
          suggestions = [TOOL_NAMES.GITHUB_SEARCH_REPOS];
        } else {
          suggestions = getErrorSuggestions(TOOL_NAMES.GITHUB_GET_CONTENTS);
        }

        return createResult(
          `Failed to explore repository structure: ${errorMessage}. Context: ${args.owner}/${args.repo} on ${args.branch}${args.path ? ` at ${args.path}` : ''}`,
          true,
          suggestions
        );
      }
    }
  );
}

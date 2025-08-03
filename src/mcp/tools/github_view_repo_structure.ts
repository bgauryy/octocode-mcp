import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createResult } from '../responses';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';
import { TOOL_NAMES, ToolOptions } from './utils/toolConstants';
import {
  generateSmartHints,
  getResearchGoalHints,
} from './utils/toolRelationships';
import { viewGitHubRepositoryStructureAPI } from '../../utils/githubAPI';
import {
  GitHubRepositoryStructureParams,
  GitHubRepositoryStructureParamsSchema,
} from './scheme/github_view_repo_structure';

const DESCRIPTION = `Explore GitHub repository structure and validate repository access.

PROJECT UNDERSTANDING:
- Try to understand more by the structure of the project and the files in the project
- Identify key directories and file patterns
- fetch important files for better understanding

IMPORTANT:
- verify default branch (use main or master if can't find default branch)
- verify path before calling the tool to avoid errors
- Start with root path to understand actual repository structure and then navigate to specific directories based on research needs
- Check repository's default branch as it varies between repositories
- Verify path exists - don't assume repository structure
- Verify repository existence and accessibility
- Validate paths before accessing specific files. Use github search code to find correct paths if unsure`;

export function registerViewRepositoryStructureTool(
  server: McpServer,
  opts: ToolOptions = { npmEnabled: false }
) {
  server.registerTool(
    TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
    {
      description: DESCRIPTION,
      inputSchema: GitHubRepositoryStructureParamsSchema.shape,
      annotations: {
        title: 'GitHub Repository Explorer',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args: GitHubRepositoryStructureParams): Promise<CallToolResult> => {
      try {
        const result = await viewRepositoryStructure(args, opts);

        // Add research goal hints if we have successful results and a research goal
        if (args.researchGoal && result && !result.isError) {
          const goalHints = getResearchGoalHints(
            TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
            args.researchGoal
          );
          if (goalHints.length > 0) {
            // Parse the existing result to add hints
            const content = result.content[0];
            if (content.type === 'text') {
              const data = JSON.parse(content.text);
              if (!data.hints) data.hints = [];
              data.hints.push(...goalHints);
              result.content[0] = {
                type: 'text',
                text: JSON.stringify(data, null, 2),
              };
            }
          }
        }

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const hints = generateSmartHints(
          TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE,
          {
            hasResults: false,
            errorMessage: `Failed to explore repository: ${errorMessage}`,
            customHints: [],
          }
        );
        return createResult({
          isError: true,
          hints,
        });
      }
    }
  );
}

/**
 * Views the structure of a GitHub repository at a specific path.
 * Uses GitHub API for reliable access with smart defaults and clear errors.
 */
export async function viewRepositoryStructure(
  params: GitHubRepositoryStructureParams,
  opts: ToolOptions = { npmEnabled: false }
): Promise<CallToolResult> {
  try {
    // Execute API request
    const result = await viewGitHubRepositoryStructureAPI(params, opts.ghToken);

    // Check if result is an error
    if ('error' in result) {
      const hints = generateSmartHints(TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE, {
        hasResults: false,
        errorMessage:
          result.error ||
          `Failed to access repository "${params.owner}/${params.repo}"`,
        customHints: result.triedBranches
          ? [`Tried branches: ${result.triedBranches.join(', ')}`]
          : [],
      });

      return createResult({
        isError: true,
        hints,
      });
    }

    // If successful, add hints and return
    const data = result;

    // Generate smart hints based on results
    const hints = generateSmartHints(TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE, {
      hasResults: true,
      totalItems: (data.files?.count || 0) + (data.folders?.count || 0),
      customHints: data.summary?.truncated
        ? ['Results truncated for performance']
        : [],
    });

    // Add hints to the response
    const responseData = { ...data, hints };

    return createResult({
      data: responseData,
      hints,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const hints = generateSmartHints(TOOL_NAMES.GITHUB_VIEW_REPO_STRUCTURE, {
      hasResults: false,
      errorMessage: `Failed to access repository "${params.owner}/${params.repo}": ${errorMessage}`,
      customHints: [],
    });

    return createResult({
      isError: true,
      hints,
    });
  }
}

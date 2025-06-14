// import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// import z from 'zod';
// import { GitHubRepositoryViewParams } from '../../types';
// import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
// import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
// import { viewGitHubRepositoryInfo } from '../../impl/github/viewGitHubRepositoryInfo';
// import { generateSmartRecovery } from '../../utils/smartRecovery';

// export function registerViewRepositoryTool(server: McpServer) {
//   server.tool(
//     TOOL_NAMES.GITHUB_GET_REPOSITORY,
//     TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_GET_REPOSITORY],
//     {
//       owner: z
//         .string()
//         .describe(
//           "Filter by repository owner/organization (e.g., 'example-org')"
//         ),
//       repo: z
//         .string()
//         .describe(
//           "The name of the GitHub repository to view (e.g. 'premium-ai-playground')"
//         ),
//     },
//     {
//       title: 'View GitHub Repository',
//       readOnlyHint: true,
//       destructiveHint: false,
//       idempotentHint: true,
//       openWorldHint: true,
//     },
//     async (args: GitHubRepositoryViewParams) => {
//       try {
//         return await viewGitHubRepositoryInfo(args);
//       } catch (error) {
//         return generateSmartRecovery({
//           tool: 'GitHub Repository View',
//           owner: args.owner,
//           repo: args.repo,
//           context: args,
//           error: error as Error,
//         });
//       }
//     }
//   );
// }

// import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// import z from 'zod';
// import { TOOL_NAMES } from '../contstants';
// import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
// import { npmView } from '../../impl/npm/npmView';

// export function registerNpmViewTool(server: McpServer) {
//   server.tool(
//     TOOL_NAMES.NPM_GET_PACKAGE,
//     TOOL_DESCRIPTIONS[TOOL_NAMES.NPM_GET_PACKAGE],
//     {
//       packageName: z
//         .string()
//         .describe(
//           "The name of the npm package to analyze (e.g., 'react', '@types/node', 'lodash'). Returns comprehensive metadata as direct object including dependencies, repository URL, scripts, engines, exports, distribution info, security attestations, and 40+ detailed NPM registry fields - all directly accessible."
//         ),
//     },
//     {
//       title: 'NPM Package Intelligence - Complete Metadata Analysis',
//       readOnlyHint: true,
//       destructiveHint: false,
//       idempotentHint: true,
//       openWorldHint: true,
//     },
//     async (args: { packageName: string }) => {
//       try {
//         return await npmView(args.packageName);
//       } catch (error) {
//         return {
//           content: [
//             {
//               type: 'text',
//               text: `Failed to get npm package info: ${(error as Error).message}`,
//             },
//           ],
//           isError: true,
//         };
//       }
//     }
//   );
// }

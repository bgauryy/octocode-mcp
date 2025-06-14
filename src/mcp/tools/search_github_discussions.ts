// import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
// import z from 'zod';
// import { GitHubDiscussionsSearchParams } from '../../types';
// import { TOOL_DESCRIPTIONS, TOOL_NAMES } from '../systemPrompts';
// import { TOOL_DESCRIPTIONS } from '../systemPrompts/tools';
// import { searchGitHubDiscussions } from '../../impl/github/searchGitHubDiscussions';

// export function registerSearchGitHubDiscussionsTool(server: McpServer) {
//   server.tool(
//     TOOL_NAMES.GITHUB_SEARCH_DISCUSSIONS,
//     TOOL_DESCRIPTIONS[TOOL_NAMES.GITHUB_SEARCH_DISCUSSIONS],
//     {
//       query: z
//         .string()
//         .min(1, 'Search query cannot be empty')
//         .describe(
//           "The search query to find discussions (e.g., 'deployment help', 'authentication tutorial', 'best practices')"
//         ),
//       owner: z
//         .string()
//         .describe(
//           "Filter by repository owner/organization (e.g., 'example-org')"
//         ),
//       repo: z
//         .string()
//         .optional()
//         .describe(
//           "Filter by specific repository name (e.g., 'cli/cli'). Note: Always do exploratory search without repo filter first"
//         ),
//       author: z.string().optional().describe('Filter by discussion author'),
//       assignee: z.string().optional().describe('Filter by assignee'),
//       mentions: z.string().optional().describe('Filter based on user mentions'),
//       commenter: z
//         .string()
//         .optional()
//         .describe('Filter based on comments by user'),
//       involves: z
//         .string()
//         .optional()
//         .describe('Filter based on involvement of user'),
//       category: z
//         .string()
//         .optional()
//         .describe(
//           "Filter by discussion category (e.g., 'Q&A', 'General', 'Show and Tell')"
//         ),
//       answered: z
//         .boolean()
//         .optional()
//         .describe(
//           'Filter by answered state (true for answered discussions only)'
//         ),
//       created: z
//         .string()
//         .optional()
//         .describe(
//           "Filter based on created date (e.g., '>2022-01-01', '<2023-12-31')"
//         ),
//       updated: z.string().optional().describe('Filter on last updated date'),
//       sort: z
//         .enum([
//           'comments',
//           'reactions',
//           'reactions-+1',
//           'reactions--1',
//           'reactions-smile',
//           'reactions-thinking_face',
//           'reactions-heart',
//           'reactions-tada',
//           'interactions',
//           'created',
//           'updated',
//         ])
//         .optional()
//         .describe('Sort discussions by specified criteria'),
//       order: z
//         .enum(['asc', 'desc'])
//         .optional()
//         .default('desc')
//         .describe('Order of results returned (default: desc)'),
//       limit: z
//         .number()
//         .optional()
//         .default(50)
//         .describe('Maximum number of discussions to return (default: 50)'),
//     },
//     {
//       title: 'Search GitHub Discussions',
//       readOnlyHint: true,
//       destructiveHint: false,
//       idempotentHint: true,
//       openWorldHint: true,
//     },
//     async (args: GitHubDiscussionsSearchParams) => {
//       try {
//         // Validate required query parameter
//         if (!args.query || args.query.trim() === '') {
//           return {
//             content: [
//               {
//                 type: 'text',
//                 text: 'Search query is required for GitHub discussions search.',
//               },
//             ],
//             isError: true,
//           };
//         }

//         return await searchGitHubDiscussions(args);
//       } catch (error) {
//         return {
//           content: [
//             {
//               type: 'text',
//               text: `Failed to search GitHub discussions: ${(error as Error).message}`,
//             },
//           ],
//           isError: true,
//         };
//       }
//     }
//   );
// }

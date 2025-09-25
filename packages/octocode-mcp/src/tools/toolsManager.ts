import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  name as githubSearchCodeName,
  description as githubSearchCodeDescription,
  searchMultipleGitHubCode,
} from './github_search_code.js';
import { GitHubCodeSearchSimpleSchema } from '../scheme/github_search_code_simple.js';
import { getServerConfig } from '../serverConfig.js';
import { createLogger } from '../utils/logger.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Register tools based on configuration
 */
export function registerTools(server: Server): {
  successCount: number;
  failedTools: string[];
} {
  const config = getServerConfig();
  const toolsToRun = config.toolsToRun || [];
  const enableTools = config.enableTools || [];
  const disableTools = config.disableTools || [];
  const logger = createLogger(server, 'tools');

  //let successCount = 0;
  const failedTools: string[] = [];

  // Check for conflicting configurations
  if (
    toolsToRun.length > 0 &&
    (enableTools.length > 0 || disableTools.length > 0)
  ) {
    logger.info(
      'TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.'
    );
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools: Tool[] = [
      {
        name: githubSearchCodeName,
        description: githubSearchCodeDescription,
        inputSchema: zodToJsonSchema(
          GitHubCodeSearchSimpleSchema
        ) as unknown as Tool['inputSchema'],
      },
    ];
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, _extra) => {
    const { name, arguments: args } = request.params;

    if (name === githubSearchCodeName) {
      // Use simplified schema for validation but cast to expected type
      const validatedArgs = GitHubCodeSearchSimpleSchema.parse(args);
      return await searchMultipleGitHubCode(
        validatedArgs.queries,
        undefined,
        undefined
      );
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    };
  });

  return { successCount: 1, failedTools };
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { DEFAULT_TOOLS } from './toolConfig.js';
import { getServerConfig, isLocalEnabled } from '../serverConfig.js';
import { ToolInvocationCallback } from '../types.js';
import { isToolAvailableSync } from './toolMetadata.js';
// Local tools imports
import { TOOL_NAMES } from './toolMetadata.js';
import {
  BulkRipgrepQuerySchema,
  LOCAL_RIPGREP_DESCRIPTION,
  type RipgrepQuery,
} from '../scheme/local_ripgrep.js';
import {
  BulkViewStructureSchema,
  LOCAL_VIEW_STRUCTURE_DESCRIPTION,
  type ViewStructureQuery,
} from '../scheme/local_view_structure.js';
import {
  BulkFindFilesSchema,
  LOCAL_FIND_FILES_DESCRIPTION,
  type FindFilesQuery,
} from '../scheme/local_find_files.js';
import {
  BulkFetchContentSchema,
  LOCAL_FETCH_CONTENT_DESCRIPTION,
  type FetchContentQuery,
} from '../scheme/local_fetch_content.js';
import { searchContentRipgrep } from './local_ripgrep.js';
import { viewStructure } from './local_view_structure.js';
import { findFiles } from './local_find_files.js';
import { fetchContent } from './local_fetch_content.js';
import { executeBulkOperation } from '../utils/bulkOperations.js';

export async function registerTools(
  server: McpServer,
  callback?: ToolInvocationCallback
): Promise<{
  successCount: number;
  failedTools: string[];
}> {
  const config = getServerConfig();
  const toolsToRun = config.toolsToRun || [];
  const enableTools = config.enableTools || [];
  const disableTools = config.disableTools || [];

  let successCount = 0;
  const failedTools: string[] = [];

  if (
    toolsToRun.length > 0 &&
    (enableTools.length > 0 || disableTools.length > 0)
  ) {
    process.stderr.write(
      'Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n'
    );
  }

  for (const tool of DEFAULT_TOOLS) {
    try {
      let shouldRegisterTool = false;
      let reason = '';
      let isAvailableInMetadata = false;

      try {
        isAvailableInMetadata = isToolAvailableSync(tool.name);
      } catch {
        isAvailableInMetadata = false;
      }

      if (!isAvailableInMetadata) {
        continue;
      }

      if (toolsToRun.length > 0) {
        shouldRegisterTool = toolsToRun.includes(tool.name);
        if (!shouldRegisterTool) {
          reason = 'not specified in TOOLS_TO_RUN configuration';
        }
      } else {
        shouldRegisterTool = tool.isDefault;

        if (enableTools.includes(tool.name)) {
          shouldRegisterTool = true;
        }

        if (!shouldRegisterTool && reason === '') {
          reason = 'not a default tool';
        }

        if (disableTools.includes(tool.name)) {
          shouldRegisterTool = false;
          reason = 'disabled by DISABLE_TOOLS configuration';
        }
      }

      if (shouldRegisterTool) {
        const result = await tool.fn(server, callback);
        if (result !== null) {
          successCount++;
        } else {
          process.stderr.write(
            `Tool ${tool.name} registration returned null (tool unavailable)\n`
          );
        }
      } else if (reason) {
        process.stderr.write(`Tool ${tool.name} ${reason}\n`);
      }
    } catch {
      failedTools.push(tool.name);
    }
  }

  // Register local tools if ENABLE_LOCAL or LOCAL is set
  if (isLocalEnabled()) {
    try {
      const registeredCount = registerLocalToolsDirectly(server);
      successCount += registeredCount;
      // If no tools were registered, treat as failure
      if (registeredCount === 0) {
        failedTools.push('local_tools');
        process.stderr.write(
          'Failed to register local tools: No tools were successfully registered\n'
        );
      }
    } catch (error) {
      process.stderr.write(
        `Failed to register local tools: ${error instanceof Error ? error.message : 'Unknown error'}\n`
      );
      failedTools.push('local_tools');
    }
  }

  return { successCount, failedTools };
}

/**
 * Register all local tools directly with the MCP server
 * @returns Number of successfully registered tools
 */
function registerLocalToolsDirectly(server: McpServer): number {
  let registeredCount = 0;

  // Register localSearchCode
  try {
    const result = server.registerTool(
      TOOL_NAMES.LOCAL_RIPGREP,
      {
        description: LOCAL_RIPGREP_DESCRIPTION,
        inputSchema: BulkRipgrepQuerySchema,
        annotations: {
          title: 'Local Ripgrep Search',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: { queries: RipgrepQuery[] }): Promise<CallToolResult> => {
        return executeBulkOperation<RipgrepQuery, Record<string, unknown>>(
          args.queries || [],
          async query => await searchContentRipgrep(query),
          { toolName: TOOL_NAMES.LOCAL_RIPGREP }
        );
      }
    );
    // Count as success if no error thrown (null indicates failure, undefined/void is success)
    if (result !== null) {
      registeredCount++;
    }
  } catch (error) {
    process.stderr.write(
      `Failed to register ${TOOL_NAMES.LOCAL_RIPGREP}: ${error instanceof Error ? error.message : 'Unknown error'}\n`
    );
  }

  // Register localViewStructure
  try {
    const result = server.registerTool(
      TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
      {
        description: LOCAL_VIEW_STRUCTURE_DESCRIPTION,
        inputSchema: BulkViewStructureSchema,
        annotations: {
          title: 'Local View Structure',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: {
        queries: ViewStructureQuery[];
      }): Promise<CallToolResult> => {
        return executeBulkOperation<
          ViewStructureQuery,
          Record<string, unknown>
        >(args.queries || [], async query => await viewStructure(query), {
          toolName: TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
        });
      }
    );
    // Count as success if result is not explicitly null (null indicates failure)
    if (result !== null) {
      registeredCount++;
    }
  } catch (error) {
    process.stderr.write(
      `Failed to register ${TOOL_NAMES.LOCAL_VIEW_STRUCTURE}: ${error instanceof Error ? error.message : 'Unknown error'}\n`
    );
  }

  // Register localFindFiles
  try {
    const result = server.registerTool(
      TOOL_NAMES.LOCAL_FIND_FILES,
      {
        description: LOCAL_FIND_FILES_DESCRIPTION,
        inputSchema: BulkFindFilesSchema,
        annotations: {
          title: 'Local Find Files',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: { queries: FindFilesQuery[] }): Promise<CallToolResult> => {
        return executeBulkOperation<FindFilesQuery, Record<string, unknown>>(
          args.queries || [],
          async query => await findFiles(query),
          { toolName: TOOL_NAMES.LOCAL_FIND_FILES }
        );
      }
    );
    // Count as success if result is not explicitly null (null indicates failure)
    if (result !== null) {
      registeredCount++;
    }
  } catch (error) {
    process.stderr.write(
      `Failed to register ${TOOL_NAMES.LOCAL_FIND_FILES}: ${error instanceof Error ? error.message : 'Unknown error'}\n`
    );
  }

  // Register localGetFileContent
  try {
    const result = server.registerTool(
      TOOL_NAMES.LOCAL_FETCH_CONTENT,
      {
        description: LOCAL_FETCH_CONTENT_DESCRIPTION,
        inputSchema: BulkFetchContentSchema,
        annotations: {
          title: 'Local Fetch Content',
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async (args: {
        queries: FetchContentQuery[];
      }): Promise<CallToolResult> => {
        return executeBulkOperation<FetchContentQuery, Record<string, unknown>>(
          args.queries || [],
          async query => await fetchContent(query),
          { toolName: TOOL_NAMES.LOCAL_FETCH_CONTENT }
        );
      }
    );
    // Count as success if result is not explicitly null (null indicates failure)
    if (result !== null) {
      registeredCount++;
    }
  } catch (error) {
    process.stderr.write(
      `Failed to register ${TOOL_NAMES.LOCAL_FETCH_CONTENT}: ${error instanceof Error ? error.message : 'Unknown error'}\n`
    );
  }

  return registeredCount;
}

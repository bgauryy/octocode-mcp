import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { DEFAULT_TOOLS } from './toolConfig.js';
import { getServerConfig, isLocalEnabled } from '../serverConfig.js';
import { ToolInvocationCallback } from '../types.js';
import { isToolAvailableSync } from './toolMetadata.js';
// Local tools imports
import { TOOL_NAMES as LOCAL_TOOL_NAMES } from '../local/constants.js';
import {
  BulkRipgrepQuerySchema,
  LOCAL_RIPGREP_DESCRIPTION,
  type RipgrepQuery,
} from '../local/scheme/local_ripgrep.js';
import {
  BulkViewStructureSchema,
  LOCAL_VIEW_STRUCTURE_DESCRIPTION,
  type ViewStructureQuery,
} from '../local/scheme/local_view_structure.js';
import {
  BulkFindFilesSchema,
  LOCAL_FIND_FILES_DESCRIPTION,
  type FindFilesQuery,
} from '../local/scheme/local_find_files.js';
import {
  BulkFetchContentSchema,
  LOCAL_FETCH_CONTENT_DESCRIPTION,
  type FetchContentQuery,
} from '../local/scheme/local_fetch_content.js';
import { searchContentRipgrep } from '../local/tools/local_ripgrep.js';
import { viewStructure } from '../local/tools/local_view_structure.js';
import { findFiles } from '../local/tools/local_find_files.js';
import { fetchContent } from '../local/tools/local_fetch_content.js';
import { executeBulkOperation } from '../local/utils/bulkOperations.js';

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

  // Register local tools if ENABLE_LOCAL is set
  if (isLocalEnabled()) {
    try {
      registerLocalToolsDirectly(server);
      successCount += 4; // 4 local tools
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
 */
function registerLocalToolsDirectly(server: McpServer): void {
  // Register localSearchCode
  server.registerTool(
    LOCAL_TOOL_NAMES.LOCAL_RIPGREP,
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
      return executeBulkOperation(
        args.queries || [],
        async (query: RipgrepQuery) => {
          return await searchContentRipgrep(query);
        },
        { toolName: LOCAL_TOOL_NAMES.LOCAL_RIPGREP }
      );
    }
  );

  // Register localViewStructure
  server.registerTool(
    LOCAL_TOOL_NAMES.LOCAL_VIEW_STRUCTURE,
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
      return executeBulkOperation(
        args.queries || [],
        async (query: ViewStructureQuery) => {
          return await viewStructure(query);
        },
        { toolName: LOCAL_TOOL_NAMES.LOCAL_VIEW_STRUCTURE }
      );
    }
  );

  // Register localFindFiles
  server.registerTool(
    LOCAL_TOOL_NAMES.LOCAL_FIND_FILES,
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
      return executeBulkOperation(
        args.queries || [],
        async (query: FindFilesQuery) => {
          return await findFiles(query);
        },
        { toolName: LOCAL_TOOL_NAMES.LOCAL_FIND_FILES }
      );
    }
  );

  // Register localGetFileContent
  server.registerTool(
    LOCAL_TOOL_NAMES.LOCAL_FETCH_CONTENT,
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
    async (args: { queries: FetchContentQuery[] }): Promise<CallToolResult> => {
      return executeBulkOperation(
        args.queries || [],
        async (query: FetchContentQuery) => {
          return await fetchContent(query);
        },
        { toolName: LOCAL_TOOL_NAMES.LOCAL_FETCH_CONTENT }
      );
    }
  );
}

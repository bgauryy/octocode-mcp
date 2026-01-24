import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ALL_TOOLS, type ToolConfig } from './toolConfig.js';
import { getServerConfig } from '../serverConfig.js';
import { ToolInvocationCallback } from '../types.js';
import { isToolInMetadata } from './toolMetadata.js';
import { logSessionError } from '../session.js';
import { TOOL_METADATA_ERRORS } from '../errorCodes.js';

/**
 * Register all tools from ALL_TOOLS (single source of truth in toolConfig.ts).
 *
 * Flow:
 * 1. Check if tool should be enabled (config filtering)
 * 2. Check if tool exists in metadata
 * 3. Register the tool
 */
export async function registerTools(
  server: McpServer,
  callback?: ToolInvocationCallback
): Promise<{
  successCount: number;
  failedTools: string[];
}> {
  const filterConfig = getToolFilterConfig();

  // Warn about configuration conflicts
  if (
    filterConfig.toolsToRun.length > 0 &&
    (filterConfig.enableTools.length > 0 ||
      filterConfig.disableTools.length > 0)
  ) {
    process.stderr.write(
      'Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n'
    );
  }

  let successCount = 0;
  const failedTools: string[] = [];

  for (const tool of ALL_TOOLS) {
    // Step 1: Check if tool should be enabled
    if (!isToolEnabled(tool, filterConfig)) {
      continue;
    }

    // Step 2: Check if tool exists in metadata
    try {
      if (!isToolInMetadata(tool.name)) {
        await logSessionError(
          tool.name,
          TOOL_METADATA_ERRORS.INVALID_FORMAT.code
        );
        continue;
      }
    } catch {
      await logSessionError(
        tool.name,
        TOOL_METADATA_ERRORS.INVALID_API_RESPONSE.code
      );
      continue;
    }

    // Step 3: Register the tool
    try {
      const result = await tool.fn(server, callback);
      if (result !== null) {
        successCount++;
      }
    } catch {
      failedTools.push(tool.name);
    }
  }

  return { successCount, failedTools };
}

// --- Helper types and functions ---

interface ToolFilterConfig {
  toolsToRun: string[];
  enableTools: string[];
  disableTools: string[];
}

function getToolFilterConfig(): ToolFilterConfig {
  const config = getServerConfig();
  return {
    toolsToRun: config.toolsToRun || [],
    enableTools: config.enableTools || [],
    disableTools: config.disableTools || [],
  };
}

/**
 * Check if tool should be enabled based on:
 * 1. TOOLS_TO_RUN (if set, only these tools are enabled)
 * 2. DISABLE_TOOLS (takes precedence over ENABLE_TOOLS)
 * 3. ENABLE_TOOLS or isDefault
 */
function isToolEnabled(tool: ToolConfig, config: ToolFilterConfig): boolean {
  const { toolsToRun, enableTools, disableTools } = config;

  // TOOLS_TO_RUN takes full precedence
  if (toolsToRun.length > 0) {
    return toolsToRun.includes(tool.name);
  }

  // DISABLE_TOOLS takes precedence over ENABLE_TOOLS
  if (disableTools.includes(tool.name)) {
    return false;
  }

  // ENABLE_TOOLS or default
  return enableTools.includes(tool.name) || tool.isDefault;
}

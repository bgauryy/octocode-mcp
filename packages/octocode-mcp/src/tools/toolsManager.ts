import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ALL_TOOLS, type ToolConfig } from './toolConfig.js';
import {
  getServerConfig,
  isLocalEnabled,
  isCloneEnabled,
} from '../serverConfig.js';
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
  const localEnabled = isLocalEnabled();
  const cloneEnabled = isCloneEnabled();
  const filterConfig = getToolFilterConfigSafe();

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
    if (!isToolEnabled(tool, localEnabled, cloneEnabled, filterConfig)) {
      continue;
    }

    // Step 2: Check if tool exists in metadata (skip for tools that opt out)
    if (!tool.skipMetadataCheck) {
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

function getToolFilterConfigSafe(): ToolFilterConfig {
  try {
    const config = getServerConfig();
    return {
      toolsToRun: config.toolsToRun || [],
      enableTools: config.enableTools || [],
      disableTools: config.disableTools || [],
    };
  } catch {
    // Config not yet initialized — return safe defaults (all defaults enabled)
    return { toolsToRun: [], enableTools: [], disableTools: [] };
  }
}

/**
 * Check if tool should be enabled based on:
 * 1. Local tools require ENABLE_LOCAL
 * 2. Clone tools additionally require ENABLE_CLONE (and ENABLE_LOCAL)
 * 3. TOOLS_TO_RUN (if set, only these tools are enabled)
 * 4. DISABLE_TOOLS (takes precedence over ENABLE_TOOLS)
 * 5. ENABLE_TOOLS or isDefault
 */
function isToolEnabled(
  tool: ToolConfig,
  localEnabled: boolean,
  cloneEnabled: boolean,
  config: ToolFilterConfig
): boolean {
  // Local tools require ENABLE_LOCAL
  if (tool.isLocal && !localEnabled) {
    return false;
  }

  // Clone tools additionally require ENABLE_CLONE
  if (tool.isClone && !cloneEnabled) {
    return false;
  }

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

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DEFAULT_TOOLS } from './tools.js';
import { getServerConfig } from '../serverConfig.js';
import { createLogger } from '../utils/logger.js';

/**
 * Register tools based on configuration
 */
export function registerTools(server: McpServer): {
  successCount: number;
  failedTools: string[];
} {
  const config = getServerConfig();
  const toolsToRun = config.toolsToRun || [];
  const enableTools = config.enableTools || [];
  const disableTools = config.disableTools || [];
  const logger = createLogger(server, 'tools');

  let successCount = 0;
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

  // Register tools based on configuration
  for (const tool of DEFAULT_TOOLS) {
    try {
      let shouldRegisterTool = false;
      let reason = '';

      if (toolsToRun.length > 0) {
        // TOOLS_TO_RUN mode: run only specified tools
        shouldRegisterTool = toolsToRun.includes(tool.name);
        if (!shouldRegisterTool) {
          reason = 'not specified in TOOLS_TO_RUN configuration';
        }
      } else {
        // Configuration mode: defaults + enableTools - disableTools
        // Start with default tools
        shouldRegisterTool = tool.isDefault;

        // Add tools from ENABLE_TOOLS (if not already default)
        if (enableTools.includes(tool.name)) {
          shouldRegisterTool = true;
        }

        if (!shouldRegisterTool && reason === '') {
          reason = 'not a default tool';
        }

        // Apply DISABLE_TOOLS
        if (disableTools.includes(tool.name)) {
          shouldRegisterTool = false;
          reason = 'disabled by DISABLE_TOOLS configuration';
        }
      }

      if (shouldRegisterTool) {
        tool.fn(server);
        successCount++;
      } else if (reason) {
        logger.info(`Tool ${tool.name} ${reason}`);
      }
    } catch (error) {
      failedTools.push(tool.name);
      logger.error(`Failed to register tool ${tool.name}`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  return { successCount, failedTools };
}

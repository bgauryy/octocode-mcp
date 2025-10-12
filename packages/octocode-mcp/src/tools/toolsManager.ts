import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DEFAULT_TOOLS } from './toolConfig.js';
import { getServerConfig } from '../serverConfig.js';

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
        tool.fn(server);
        successCount++;
      } else if (reason) {
        process.stderr.write(`Tool ${tool.name} ${reason}\n`);
      }
    } catch (error) {
      failedTools.push(tool.name);
    }
  }

  return { successCount, failedTools };
}

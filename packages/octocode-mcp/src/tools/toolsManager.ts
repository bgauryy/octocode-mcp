import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DEFAULT_TOOLS } from './tools.js';
import { logToolEvent, AuditLogger } from '../security/auditLogger.js';
import { getServerConfig } from '../serverConfig.js';

/**
 * Register tools based on configuration
 */
export function registerTools(server: McpServer): {
  successCount: number;
  failedTools: string[];
} {
  // Initialize audit logger if not already initialized
  AuditLogger.initialize();

  const config = getServerConfig();
  const toolsToRun = config.toolsToRun || [];
  const enableTools = config.enableTools || [];
  const disableTools = config.disableTools || [];

  let successCount = 0;
  const failedTools: string[] = [];

  // Log tool registration start
  logToolEvent('registration_start');

  // Check for conflicting configurations
  if (toolsToRun.length > 0 && (enableTools.length > 0 || disableTools.length > 0)) {
    process.stderr.write('Warning: TOOLS_TO_RUN cannot be used together with ENABLE_TOOLS/DISABLE_TOOLS. Using TOOLS_TO_RUN exclusively.\n');
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

        // Audit successful tool registration
        logToolEvent(tool.name);
      } else if (reason) {
        process.stderr.write(`Tool ${tool.name} ${reason}\n`);

        // Audit disabled/skipped tool
        logToolEvent(`${tool.name}_skipped`);
      }
    } catch (error) {
      failedTools.push(tool.name);

      // Audit failed tool registration
      logToolEvent(`${tool.name}_failed`);
    }
  }

  // Log final registration summary
  logToolEvent('registration_complete');

  return { successCount, failedTools };
}

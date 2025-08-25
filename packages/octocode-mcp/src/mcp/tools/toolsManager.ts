import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DEFAULT_TOOLS } from './tools.js';
import { logToolEvent, AuditLogger } from '../../security/auditLogger.js';
import {
  getToolsToRun,
  getEnableTools,
  getDisableTools,
} from '../../../config.js';

/**
 * Register tools based on configuration
 */
export function registerTools(server: McpServer): {
  successCount: number;
  failedTools: string[];
} {
  // Initialize audit logger if not already initialized
  AuditLogger.initialize();

  const toolsToRun = getToolsToRun() || [];
  const enableTools = getEnableTools() || [];
  const disableTools = getDisableTools() || [];

  let successCount = 0;
  const failedTools: string[] = [];

  // Log tool registration start
  logToolEvent('registration_start');

  // Register tools based on configuration
  for (const tool of DEFAULT_TOOLS) {
    try {
      let shouldRegisterTool = false;
      let reason = '';

      // Three distinct configuration modes:
      // 1. TOOLS_TO_RUN - exclusive mode: run ONLY these tools
      // 2. ENABLE_TOOLS/DISABLE_TOOLS - additive/subtractive: modify default tools
      // 3. Default mode - run only default tools

      if (toolsToRun.length > 0) {
        // Mode 1: TOOLS_TO_RUN - truly exclusive, ignores all other configuration
        shouldRegisterTool = toolsToRun.includes(tool.name);
        if (!shouldRegisterTool) {
          reason = 'not in TOOLS_TO_RUN list (exclusive mode)';
        }
        // Note: DISABLE_TOOLS is ignored in TOOLS_TO_RUN mode
      } else {
        // Mode 2 & 3: Standard mode with defaults + enableTools - disableTools
        // Start with default tools
        shouldRegisterTool = tool.isDefault;

        // Add tools from ENABLE_TOOLS (if not already default)
        if (enableTools.includes(tool.name)) {
          shouldRegisterTool = true;
        }

        if (!shouldRegisterTool && reason === '') {
          reason = 'not a default tool';
        }

        // DISABLE_TOOLS only applies in standard mode (not TOOLS_TO_RUN mode)
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

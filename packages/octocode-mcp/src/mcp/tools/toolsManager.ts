import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DEFAULT_TOOLS } from './tools.js';
import { logToolEvent, AuditLogger } from '../../security/auditLogger.js';
import { getEnableTools, getDisableTools } from '../../../config.js';

/**
 * Register tools based on configuration
 */
export function registerTools(server: McpServer): {
  successCount: number;
  failedTools: string[];
} {
  // Initialize audit logger if not already initialized
  AuditLogger.initialize();

  const enableTools = getEnableTools() || [];
  const disableTools = getDisableTools() || [];

  let successCount = 0;
  const failedTools: string[] = [];

  // Log tool registration start
  logToolEvent('registration_start', 'success', {
    totalTools: DEFAULT_TOOLS.length,
    enableTools,
    disableTools,
  });

  // Register tools based on configuration
  for (const tool of DEFAULT_TOOLS) {
    try {
      let shouldRegisterTool = false;
      let reason = '';

      // Start with default tools
      shouldRegisterTool = tool.isDefault;

      // Add tools from ENABLE_TOOLS (if not already default)
      if (enableTools.includes(tool.name)) {
        shouldRegisterTool = true;
      }

      // Remove tools from DISABLE_TOOLS (takes priority)
      if (disableTools.includes(tool.name)) {
        shouldRegisterTool = false;
        reason = 'disabled by DISABLE_TOOLS configuration';
      }

      if (!shouldRegisterTool && reason === '') {
        reason = 'not a default tool';
      }

      if (shouldRegisterTool) {
        tool.fn(server);
        successCount++;

        // Audit successful tool registration
        logToolEvent('registration_success', 'success', {
          toolName: tool.name,
          isDefault: tool.isDefault,
          explicitlyEnabled: enableTools.includes(tool.name),
        });
      } else if (reason) {
        process.stderr.write(`Tool ${tool.name} ${reason}\n`);

        // Audit disabled/skipped tool
        logToolEvent('registration_skipped', 'success', {
          toolName: tool.name,
          reason,
          isDefault: tool.isDefault,
          explicitlyDisabled: disableTools.includes(tool.name),
        });
      }
    } catch (error) {
      failedTools.push(tool.name);

      // Audit failed tool registration
      logToolEvent('registration_failed', 'failure', {
        toolName: tool.name,
        error: error instanceof Error ? error.message : String(error),
        isDefault: tool.isDefault,
      });
    }
  }

  // Log final registration summary
  logToolEvent('registration_complete', 'success', {
    successCount,
    failedCount: failedTools.length,
    failedTools,
    totalTools: DEFAULT_TOOLS.length,
  });

  return { successCount, failedTools };
}

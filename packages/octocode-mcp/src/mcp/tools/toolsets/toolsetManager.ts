import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ServerConfig } from '../../../config/serverConfig.js';
import { DEFAULT_TOOLSETS } from './tools.js';
import { logToolEvent, AuditLogger } from '../../../security/auditLogger.js';

export interface ToolRegistrationConfig {
  serverConfig: ServerConfig;
  userConfig: {
    enableTools?: string[];
    disableTools?: string[];
  };
}

/**
 * Register tools based on configuration
 */
export function registerTools(
  server: McpServer,
  config: ToolRegistrationConfig
): { successCount: number; failedTools: string[] } {
  // Initialize audit logger if not already initialized
  AuditLogger.initialize();

  const enableTools = config.userConfig.enableTools || [];
  const disableTools = config.userConfig.disableTools || [];

  let successCount = 0;
  const failedTools: string[] = [];

  // Log tool registration start
  logToolEvent('registration_start', 'success', {
    totalTools: DEFAULT_TOOLSETS.length,
    enableTools,
    disableTools,
  });

  // Register tools based on configuration
  for (const tool of DEFAULT_TOOLSETS) {
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

  // Enable auth tools automatically if organization is configured
  if (process.env.GITHUB_ORGANIZATION) {
    try {
      // Auth tools are enabled automatically in enterprise mode
      // No additional registration needed - existing tools handle enterprise mode
      process.stderr.write('🔒 Enterprise mode active: auth tools enabled\n');

      // Audit enterprise mode activation
      logToolEvent('enterprise_mode_activated', 'success', {
        organization: process.env.GITHUB_ORGANIZATION,
        authToolsEnabled: true,
      });
    } catch (error) {
      // Enterprise auth setup failed but don't break startup
      logToolEvent('enterprise_mode_failed', 'failure', {
        organization: process.env.GITHUB_ORGANIZATION,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Log final registration summary
  logToolEvent('registration_complete', 'success', {
    successCount,
    failedCount: failedTools.length,
    failedTools,
    totalTools: DEFAULT_TOOLSETS.length,
  });

  return { successCount, failedTools };
}

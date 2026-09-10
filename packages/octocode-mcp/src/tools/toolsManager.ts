import { McpServer } from '@modelcontextprotocol/server';
import type { McpToolConfig } from './toolConfig.js';
import {
  getServerConfig,
  isLocalEnabled,
  isCloneEnabled,
  type ToolInvocationCallback,
} from '@octocodeai/octocode-tools-core';
import {
  getToolFilterConfig,
  isToolEnabled,
  validateToolFilterConfig,
} from './toolFilters.js';
import { withOutputSanitization } from '../utils/secureServer.js';
import {
  registerToolsBatch,
  summarizeOutcomes,
} from './registrationExecutor.js';

export async function registerTools(
  server: McpServer,
  callback?: ToolInvocationCallback,
  options: {
    toolLoader?: () => Promise<McpToolConfig[]> | McpToolConfig[];
    enabledTools?: McpToolConfig[];
  } = {}
): Promise<{
  successCount: number;
  failedTools: string[];
  failedToolErrors?: Record<string, string>;
}> {
  const secureServer = withOutputSanitization(server);
  const enabledTools =
    options.enabledTools ?? (await getEnabledTools(options.toolLoader));
  const outcomes = await registerToolsBatch(
    enabledTools,
    secureServer,
    callback
  );
  return summarizeOutcomes(outcomes);
}

/** Select once so startup instructions and registration share the same gates. */
export async function getEnabledTools(
  toolLoader?: () => Promise<McpToolConfig[]> | McpToolConfig[]
): Promise<McpToolConfig[]> {
  const localEnabled = isLocalEnabled();
  const cloneEnabled = isCloneEnabled();
  const rawFilterConfig = getToolFilterConfig(getServerConfig);
  const allTools = await loadTools(toolLoader);
  const { config: filterConfig, warnings } = validateToolFilterConfig(
    rawFilterConfig,
    allTools.map(tool => tool.name)
  );
  for (const warning of warnings) process.stderr.write(warning);
  return allTools.filter(tool =>
    isToolEnabled(tool, {
      localEnabled,
      cloneEnabled,
      filterConfig,
    })
  );
}

async function loadTools(
  injectedLoader?: () => Promise<McpToolConfig[]> | McpToolConfig[]
): Promise<McpToolConfig[]> {
  if (injectedLoader) {
    return Promise.resolve(injectedLoader());
  }

  const { ALL_TOOLS } = await import('./toolConfig.js');
  return ALL_TOOLS;
}

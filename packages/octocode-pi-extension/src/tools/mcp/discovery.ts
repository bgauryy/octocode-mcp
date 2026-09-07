import {
  discoverMcpSystem as discoverSharedMcpSystem,
  type DiscoverMcpConfigOptions,
  type DiscoveredMcpConfig,
  type McpDiscoveryResult,
} from '@octocodeai/agent-contracts/agent-skills';
import { extensionWorkspaceRoot } from '../../extension-paths.js';

/** Pi owns its workspace storage policy; shared contracts own discovery and admission. */
export function discoverMcpSystem(cwd: string, options?: string | DiscoverMcpConfigOptions): McpDiscoveryResult {
  return discoverSharedMcpSystem(cwd, {
    ...(typeof options === 'string' ? { homeDir: options } : options),
    workspaceRoot: extensionWorkspaceRoot,
  });
}

export function discoverMcpConfigs(cwd: string, options?: string | DiscoverMcpConfigOptions): DiscoveredMcpConfig[] {
  return discoverMcpSystem(cwd, options).configs;
}

/**
 * Centralized Application State
 *
 * Single source of truth for all UI state.
 * All UI components should import state from this module.
 */

import {
  getAllClientInstallStatus,
  type ClientInstallStatus,
} from '../utils/mcp-config.js';
import { detectCurrentClient } from '../utils/mcp-paths.js';
import { getAuthStatusAsync } from '../features/github-oauth.js';
import type { OctocodeAuthStatus } from '../types/index.js';

// ============================================================================
// State Types
// ============================================================================

/**
 * Octocode MCP installation state
 */
interface OctocodeState {
  installedClients: ClientInstallStatus[];
  availableClients: ClientInstallStatus[];
  /** Total count of clients where Octocode is installed */
  installedCount: number;
  /** Total count of clients available for installation */
  availableCount: number;
  isInstalled: boolean;
  hasMoreToInstall: boolean;
}

/**
 * Unified application state for all UI views
 */
export interface AppState {
  octocode: OctocodeState;
  currentClient: string | null;
  githubAuth: OctocodeAuthStatus;
}

// ============================================================================
// State Getters
// ============================================================================

/**
 * Get Octocode MCP installation state
 */
function getOctocodeState(): OctocodeState {
  const allClients = getAllClientInstallStatus();
  const installedClients = allClients.filter(c => c.octocodeInstalled);
  const availableClients = allClients.filter(
    c => c.configExists && !c.octocodeInstalled
  );

  return {
    installedClients,
    availableClients,
    installedCount: installedClients.length,
    availableCount: availableClients.length,
    isInstalled: installedClients.length > 0,
    hasMoreToInstall: availableClients.length > 0,
  };
}

/**
 * Get unified application state
 * Uses async auth check to properly check credential storage
 */
export async function getAppState(): Promise<AppState> {
  return {
    octocode: getOctocodeState(),
    currentClient: detectCurrentClient(),
    githubAuth: await getAuthStatusAsync(),
  };
}

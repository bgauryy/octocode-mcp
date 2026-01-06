/**
 * MCP Configuration Sync
 *
 * Synchronizes MCP server configurations across all installed IDE clients.
 * Handles merging, conflict resolution, and batch writes.
 */

import type { MCPClient, MCPConfig, MCPServer } from '../types/index.js';
import {
  getMCPConfigPath,
  detectAvailableClients,
  configFileExists,
  MCP_CLIENTS,
} from '../utils/mcp-paths.js';
import { readMCPConfig, writeMCPConfig } from '../utils/mcp-io.js';

/**
 * MCP server config with source client tracking
 */
export interface MCPServerWithSource {
  server: MCPServer;
  sourceClient: MCPClient;
  configPath: string;
}

/**
 * Represents a single MCP across all clients
 */
export interface MCPAcrossClients {
  mcpId: string;
  configs: Map<MCPClient, MCPServer>;
  isConsistent: boolean;
}

/**
 * Client config snapshot
 */
export interface ClientConfigSnapshot {
  client: MCPClient;
  configPath: string;
  config: MCPConfig | null;
  exists: boolean;
  mcpCount: number;
}

/**
 * Diff result for a single MCP
 */
export interface MCPDiff {
  mcpId: string;
  presentIn: MCPClient[];
  missingIn: MCPClient[];
  hasConflict: boolean;
  variants: Map<MCPClient, MCPServer>;
}

/**
 * Full sync analysis result
 */
export interface SyncAnalysis {
  clients: ClientConfigSnapshot[];
  allMCPs: Set<string>;
  diffs: MCPDiff[];
  fullyConsistent: MCPDiff[];
  needsSync: MCPDiff[];
  conflicts: MCPDiff[];
  summary: {
    totalClients: number;
    clientsWithConfig: number;
    totalUniqueMCPs: number;
    consistentMCPs: number;
    needsSyncCount: number;
    conflictCount: number;
  };
}

/**
 * User's resolution choice for a conflict
 */
export interface ConflictResolution {
  mcpId: string;
  chosenConfig: MCPServer;
  sourceClient: MCPClient;
}

/**
 * Sync operation result
 */
export interface SyncResult {
  success: boolean;
  clientResults: Map<
    MCPClient,
    { success: boolean; error?: string; backupPath?: string }
  >;
  mcpsSynced: string[];
  errors: string[];
}

/**
 * Read configs from all available clients
 */
export function readAllClientConfigs(): ClientConfigSnapshot[] {
  const availableClients = detectAvailableClients();
  const snapshots: ClientConfigSnapshot[] = [];

  for (const client of availableClients) {
    const configPath = getMCPConfigPath(client);
    const exists = configFileExists(client);
    let config: MCPConfig | null = null;
    let mcpCount = 0;

    if (exists) {
      config = readMCPConfig(configPath);
      if (config?.mcpServers) {
        mcpCount = Object.keys(config.mcpServers).length;
      }
    }

    snapshots.push({
      client,
      configPath,
      config,
      exists,
      mcpCount,
    });
  }

  return snapshots;
}

/**
 * Compare two MCP server configs for equality
 */
export function areMCPServersEqual(a: MCPServer, b: MCPServer): boolean {
  // Compare command
  if (a.command !== b.command) return false;

  // Compare args
  const aArgs = a.args || [];
  const bArgs = b.args || [];
  if (aArgs.length !== bArgs.length) return false;
  for (let i = 0; i < aArgs.length; i++) {
    if (aArgs[i] !== bArgs[i]) return false;
  }

  // Compare env vars
  const aEnvKeys = Object.keys(a.env || {}).sort();
  const bEnvKeys = Object.keys(b.env || {}).sort();

  if (aEnvKeys.length !== bEnvKeys.length) return false;

  for (let i = 0; i < aEnvKeys.length; i++) {
    if (aEnvKeys[i] !== bEnvKeys[i]) return false;
    if ((a.env || {})[aEnvKeys[i]] !== (b.env || {})[bEnvKeys[i]]) return false;
  }

  return true;
}

/**
 * Analyze configs across all clients and identify differences
 */
export function analyzeSyncState(
  snapshots: ClientConfigSnapshot[]
): SyncAnalysis {
  const clientsWithConfig = snapshots.filter(s => s.exists && s.config);
  const allMCPs = new Set<string>();
  const mcpToClients = new Map<string, Map<MCPClient, MCPServer>>();

  // Gather all MCPs and their configs per client
  for (const snapshot of clientsWithConfig) {
    if (!snapshot.config?.mcpServers) continue;

    for (const [mcpId, server] of Object.entries(snapshot.config.mcpServers)) {
      allMCPs.add(mcpId);

      if (!mcpToClients.has(mcpId)) {
        mcpToClients.set(mcpId, new Map());
      }
      mcpToClients.get(mcpId)!.set(snapshot.client, server);
    }
  }

  // Build diffs
  const diffs: MCPDiff[] = [];
  const allClientIds = clientsWithConfig.map(s => s.client);

  for (const mcpId of allMCPs) {
    const variants = mcpToClients.get(mcpId) || new Map();
    const presentIn = Array.from(variants.keys());
    const missingIn = allClientIds.filter(c => !variants.has(c));

    // Check for conflicts (different configs for same MCP)
    let hasConflict = false;
    const configs = Array.from(variants.values());
    if (configs.length > 1) {
      const firstConfig = configs[0];
      for (let i = 1; i < configs.length; i++) {
        if (!areMCPServersEqual(firstConfig, configs[i])) {
          hasConflict = true;
          break;
        }
      }
    }

    diffs.push({
      mcpId,
      presentIn,
      missingIn,
      hasConflict,
      variants,
    });
  }

  // Categorize diffs
  const fullyConsistent = diffs.filter(
    d => d.missingIn.length === 0 && !d.hasConflict
  );
  const needsSync = diffs.filter(d => d.missingIn.length > 0 && !d.hasConflict);
  const conflicts = diffs.filter(d => d.hasConflict);

  return {
    clients: snapshots,
    allMCPs,
    diffs,
    fullyConsistent,
    needsSync,
    conflicts,
    summary: {
      totalClients: snapshots.length,
      clientsWithConfig: clientsWithConfig.length,
      totalUniqueMCPs: allMCPs.size,
      consistentMCPs: fullyConsistent.length,
      needsSyncCount: needsSync.length,
      conflictCount: conflicts.length,
    },
  };
}

/**
 * Build merged config for a client
 */
export function buildMergedConfig(
  currentConfig: MCPConfig | null,
  mcpsToSync: Array<{ mcpId: string; server: MCPServer }>
): MCPConfig {
  const merged: MCPConfig = {
    mcpServers: { ...(currentConfig?.mcpServers || {}) },
  };

  for (const { mcpId, server } of mcpsToSync) {
    merged.mcpServers![mcpId] = server;
  }

  return merged;
}

/**
 * Get the canonical config for an MCP (first available or resolved)
 */
export function getCanonicalConfig(
  diff: MCPDiff,
  resolution?: ConflictResolution
): MCPServer | null {
  if (resolution) {
    return resolution.chosenConfig;
  }

  // If no conflict, return first variant
  if (!diff.hasConflict && diff.variants.size > 0) {
    return Array.from(diff.variants.values())[0];
  }

  return null;
}

/**
 * Execute sync across all clients
 */
export function executeSyncToClients(
  snapshots: ClientConfigSnapshot[],
  mcpsToSync: Array<{ mcpId: string; server: MCPServer }>,
  targetClients?: MCPClient[]
): SyncResult {
  const results = new Map<
    MCPClient,
    { success: boolean; error?: string; backupPath?: string }
  >();
  const errors: string[] = [];
  const mcpsSynced: string[] = [];

  const clients = targetClients
    ? snapshots.filter(s => targetClients.includes(s.client))
    : snapshots.filter(s => s.exists);

  for (const snapshot of clients) {
    const mergedConfig = buildMergedConfig(snapshot.config, mcpsToSync);

    const writeResult = writeMCPConfig(snapshot.configPath, mergedConfig);

    if (writeResult.success) {
      results.set(snapshot.client, {
        success: true,
        backupPath: writeResult.backupPath,
      });
    } else {
      const error = writeResult.error || 'Unknown write error';
      results.set(snapshot.client, { success: false, error });
      errors.push(
        `${MCP_CLIENTS[snapshot.client]?.name || snapshot.client}: ${error}`
      );
    }
  }

  // Track which MCPs were synced
  for (const { mcpId } of mcpsToSync) {
    if (!mcpsSynced.includes(mcpId)) {
      mcpsSynced.push(mcpId);
    }
  }

  const allSuccess = Array.from(results.values()).every(r => r.success);

  return {
    success: allSuccess,
    clientResults: results,
    mcpsSynced,
    errors,
  };
}

/**
 * Prepare sync payload from analysis and resolutions
 */
export function prepareSyncPayload(
  analysis: SyncAnalysis,
  resolutions: ConflictResolution[]
): Array<{ mcpId: string; server: MCPServer }> {
  const payload: Array<{ mcpId: string; server: MCPServer }> = [];
  const resolutionMap = new Map(resolutions.map(r => [r.mcpId, r]));

  // Add MCPs that need sync (no conflict, just missing from some clients)
  for (const diff of analysis.needsSync) {
    const server = getCanonicalConfig(diff);
    if (server) {
      payload.push({ mcpId: diff.mcpId, server });
    }
  }

  // Add resolved conflicts
  for (const diff of analysis.conflicts) {
    const resolution = resolutionMap.get(diff.mcpId);
    if (resolution) {
      payload.push({ mcpId: diff.mcpId, server: resolution.chosenConfig });
    }
  }

  return payload;
}

/**
 * Quick check if sync is needed
 */
export function isSyncNeeded(analysis: SyncAnalysis): boolean {
  return (
    analysis.summary.needsSyncCount > 0 || analysis.summary.conflictCount > 0
  );
}

/**
 * Get human-readable client name
 */
export function getClientDisplayName(client: MCPClient): string {
  return MCP_CLIENTS[client]?.name || client;
}

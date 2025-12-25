/**
 * MCP Config I/O Operations
 */

import path from 'node:path';
import fs from 'node:fs';
import type { MCPConfig } from '../types/index.js';
import {
  fileExists,
  readJsonFile,
  writeJsonFile,
  backupFile,
  dirExists,
} from './fs.js';

/**
 * Read MCP config file
 */
export function readMCPConfig(configPath: string): MCPConfig | null {
  if (!fileExists(configPath)) {
    return { mcpServers: {} };
  }
  return readJsonFile<MCPConfig>(configPath);
}

/**
 * Write MCP config file with backup
 */
export function writeMCPConfig(
  configPath: string,
  config: MCPConfig,
  createBackup: boolean = true
): { success: boolean; backupPath?: string; error?: string } {
  try {
    // Create backup if file exists
    let backupPath: string | undefined;
    if (createBackup && fileExists(configPath)) {
      const backup = backupFile(configPath);
      if (backup) {
        backupPath = backup;
      }
    }

    // Ensure directory exists
    const dir = path.dirname(configPath);
    if (!dirExists(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write config
    const success = writeJsonFile(configPath, config);
    if (!success) {
      return { success: false, error: 'Failed to write config file' };
    }

    return { success: true, backupPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

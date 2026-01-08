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
import { getSkillsSourceDir, getSkillsDestDir } from '../utils/skills.js';
import { dirExists, listSubdirectories } from '../utils/fs.js';
import { detectCurrentClient } from '../utils/mcp-paths.js';
import { getAuthStatus } from '../features/github-oauth.js';
import type { OctocodeAuthStatus } from '../types/index.js';
import path from 'node:path';

// ============================================================================
// State Types
// ============================================================================

/**
 * Skill installation info
 */
interface SkillInfo {
  name: string;
  installed: boolean;
  srcPath: string;
  destPath: string;
}

/**
 * Skills state - counts bundled and all installed skills
 */
export interface SkillsState {
  sourceExists: boolean;
  destDir: string;
  skills: SkillInfo[];
  /** Count of bundled skills that are installed */
  installedCount: number;
  /** Count of bundled skills not yet installed */
  notInstalledCount: number;
  /** Total count of ALL installed skills (bundled + marketplace) */
  totalInstalledCount: number;
  allInstalled: boolean;
  hasSkills: boolean;
}

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
  skills: SkillsState;
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
 * Get Skills state - includes counts for both bundled and all installed
 */
function getSkillsState(): SkillsState {
  const srcDir = getSkillsSourceDir();
  const destDir = getSkillsDestDir();

  // Count ALL installed skills (bundled + marketplace) from destination directory
  const totalInstalledCount = dirExists(destDir)
    ? listSubdirectories(destDir).filter(name => !name.startsWith('.')).length
    : 0;

  if (!dirExists(srcDir)) {
    return {
      sourceExists: false,
      destDir,
      skills: [],
      installedCount: 0,
      notInstalledCount: 0,
      totalInstalledCount,
      allInstalled: false,
      hasSkills: false,
    };
  }

  const availableSkills = listSubdirectories(srcDir).filter(
    name => !name.startsWith('.')
  );

  const skills: SkillInfo[] = availableSkills.map(skill => ({
    name: skill,
    installed: dirExists(path.join(destDir, skill)),
    srcPath: path.join(srcDir, skill),
    destPath: path.join(destDir, skill),
  }));

  const installedCount = skills.filter(s => s.installed).length;
  const notInstalledCount = skills.filter(s => !s.installed).length;

  return {
    sourceExists: true,
    destDir,
    skills,
    installedCount,
    notInstalledCount,
    totalInstalledCount,
    allInstalled: notInstalledCount === 0 && skills.length > 0,
    hasSkills: skills.length > 0,
  };
}

/**
 * Get unified application state
 * Uses sync auth check (file storage + gh CLI only) to avoid keychain popup on startup
 */
export function getAppState(): AppState {
  return {
    octocode: getOctocodeState(),
    skills: getSkillsState(),
    currentClient: detectCurrentClient(),
    githubAuth: getAuthStatus(),
  };
}

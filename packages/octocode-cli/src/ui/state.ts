import {
  getAllClientInstallStatus,
  type ClientInstallStatus,
} from '../utils/mcp-config.js';
import { getSkillsSourceDir, getSkillsDestDir } from '../utils/skills.js';
import { dirExists, listSubdirectories } from '../utils/fs.js';
import { detectCurrentClient } from '../utils/mcp-paths.js';
import { getAuthStatusAsync } from '../features/github-oauth.js';
import type { OctocodeAuthStatus } from '../types/index.js';
import path from 'node:path';

interface SkillInfo {
  name: string;
  installed: boolean;
  srcPath: string;
  destPath: string;
}

export interface SkillsState {
  sourceExists: boolean;
  destDir: string;
  skills: SkillInfo[];

  installedCount: number;

  notInstalledCount: number;

  totalInstalledCount: number;
  allInstalled: boolean;
  hasSkills: boolean;
}

interface OctocodeState {
  installedClients: ClientInstallStatus[];
  availableClients: ClientInstallStatus[];

  installedCount: number;

  availableCount: number;
  isInstalled: boolean;
  hasMoreToInstall: boolean;
}

export interface AppState {
  octocode: OctocodeState;
  skills: SkillsState;
  currentClient: string | null;
  githubAuth: OctocodeAuthStatus;
}

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

function getSkillsState(): SkillsState {
  const srcDir = getSkillsSourceDir();
  const destDir = getSkillsDestDir();

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

export async function getAppState(): Promise<AppState> {
  return {
    octocode: getOctocodeState(),
    skills: getSkillsState(),
    currentClient: detectCurrentClient(),
    githubAuth: await getAuthStatusAsync(),
  };
}

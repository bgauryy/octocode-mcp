/**
 * Skills Utilities
 * Functions for locating and copying bundled skills to user directories
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { copyDirectory, dirExists, listSubdirectories } from './fs.js';
import { HOME, isWindows, getAppDataPath } from './platform.js';

/**
 * Get the path to the bundled skills directory
 * Works both in development and when installed as npm package
 */
export function getSkillsSourcePath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  // In built output: out/octocode-cli.js -> skills/
  // In development: src/utils/skills.ts -> ../../skills/
  const fromOut = join(currentDir, '..', 'skills');
  const fromSrc = join(currentDir, '..', '..', 'skills');

  if (dirExists(fromOut)) {
    return fromOut;
  }

  if (dirExists(fromSrc)) {
    return fromSrc;
  }

  throw new Error('Skills directory not found');
}

/**
 * Copy all skills to a destination directory
 * @param destDir - Destination directory (e.g., ~/.claude/skills)
 * @returns true if successful
 */
export function copySkills(destDir: string): boolean {
  const skillsSource = getSkillsSourcePath();
  return copyDirectory(skillsSource, destDir);
}

/**
 * Copy a specific skill to a destination directory
 * @param skillName - Name of the skill (e.g., 'octocode-research')
 * @param destDir - Destination directory
 * @returns true if successful
 */
export function copySkill(skillName: string, destDir: string): boolean {
  const skillsSource = getSkillsSourcePath();
  const skillPath = join(skillsSource, skillName);

  if (!dirExists(skillPath)) {
    return false;
  }

  const destPath = join(destDir, skillName);
  return copyDirectory(skillPath, destPath);
}

/**
 * Get list of available skills
 * @returns Array of skill names
 */
export function getAvailableSkills(): string[] {
  const skillsSource = getSkillsSourcePath();
  return listSubdirectories(skillsSource).filter(name =>
    name.startsWith('octocode-')
  );
}

/**
 * Get skills source directory (simple version for bundled output)
 * From built output: out/octocode-cli.js -> ../skills
 * @returns Resolved path to skills directory
 */
export function getSkillsSourceDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);
  return resolve(currentDir, '..', 'skills');
}

/**
 * Get Claude skills destination directory
 * Windows: %APPDATA%\Claude\skills\
 * macOS/Linux: ~/.claude/skills/
 * @returns Path to user's Claude skills directory
 */
export function getSkillsDestDir(): string {
  if (isWindows) {
    const appData = getAppDataPath();
    return join(appData, 'Claude', 'skills');
  }
  return join(HOME, '.claude', 'skills');
}

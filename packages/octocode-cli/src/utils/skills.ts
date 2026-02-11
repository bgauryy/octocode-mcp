/**
 * Skills Utilities
 * Functions for locating and copying bundled skills to user directories
 */

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  copyDirectory,
  dirExists,
  listSubdirectories,
  fileExists,
  readFileContent,
} from './fs.js';
import { HOME, isWindows, getAppDataPath } from './platform.js';

// ============================================================================
// Config Storage
// ============================================================================

const OCTOCODE_DIR = join(HOME, '.octocode');
const CONFIG_FILE = join(OCTOCODE_DIR, 'config.json');

interface OctocodeConfig {
  skillsDestDir?: string;
}

/**
 * Load CLI config from ~/.octocode/config.json
 */
function loadConfig(): OctocodeConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      return JSON.parse(content) as OctocodeConfig;
    }
  } catch {
    // Ignore errors, return empty config
  }
  return {};
}

/**
 * Save CLI config to ~/.octocode/config.json
 */
function saveConfig(config: OctocodeConfig): void {
  try {
    if (!existsSync(OCTOCODE_DIR)) {
      mkdirSync(OCTOCODE_DIR, { recursive: true, mode: 0o700 });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch {
    // Ignore errors
  }
}

/**
 * Set custom skills destination directory
 * @param path - Custom path or null to reset to default
 */
export function setCustomSkillsDestDir(path: string | null): void {
  const config = loadConfig();
  if (path) {
    config.skillsDestDir = path;
  } else {
    delete config.skillsDestDir;
  }
  saveConfig(config);
}

/**
 * Get custom skills destination directory if set
 * @returns Custom path or null if using default
 */
export function getCustomSkillsDestDir(): string | null {
  const config = loadConfig();
  return config.skillsDestDir || null;
}

/**
 * Get default skills destination directory (without custom override)
 */
export function getDefaultSkillsDestDir(): string {
  if (isWindows) {
    const appData = getAppDataPath();
    return join(appData, 'Claude', 'skills');
  }
  return join(HOME, '.claude', 'skills');
}

/**
 * Skill metadata from SKILL.md frontmatter
 */
interface SkillMetadata {
  name: string;
  description: string;
  folder: string;
}

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
 * Checks for custom path first, falls back to default:
 * - Windows: %APPDATA%\Claude\skills\
 * - macOS/Linux: ~/.claude/skills/
 * @returns Path to user's Claude skills directory
 */
export function getSkillsDestDir(): string {
  const customPath = getCustomSkillsDestDir();
  if (customPath) {
    return customPath;
  }
  return getDefaultSkillsDestDir();
}

/**
 * Parse YAML frontmatter from SKILL.md content
 * Extracts name and description from ---delimited frontmatter
 */
function parseSkillFrontmatter(
  content: string
): { name: string; description: string } | null {
  // Match YAML frontmatter between --- delimiters
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return null;
  }

  const frontmatter = frontmatterMatch[1];

  // Extract name field
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  // Extract description field (may span multiple lines if quoted)
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  if (!nameMatch || !descMatch) {
    return null;
  }

  return {
    name: nameMatch[1].trim(),
    description: descMatch[1].trim(),
  };
}

/**
 * Get metadata for a single skill from its SKILL.md file
 * @param skillPath - Path to the skill directory
 * @returns Skill metadata or null if not found/invalid
 */
export function getSkillMetadata(skillPath: string): SkillMetadata | null {
  const skillMdPath = join(skillPath, 'SKILL.md');

  if (!fileExists(skillMdPath)) {
    return null;
  }

  const content = readFileContent(skillMdPath);
  if (!content) {
    return null;
  }

  const parsed = parseSkillFrontmatter(content);
  if (!parsed) {
    return null;
  }

  return {
    name: parsed.name,
    description: parsed.description,
    folder: skillPath.split('/').pop() || '',
  };
}

/**
 * Get metadata for all available skills
 * @returns Array of skill metadata
 */
export function getAllSkillsMetadata(): SkillMetadata[] {
  const skillsSource = getSkillsSourcePath();
  const skillDirs = listSubdirectories(skillsSource).filter(name =>
    name.startsWith('octocode-')
  );

  const skills: SkillMetadata[] = [];

  for (const skillDir of skillDirs) {
    const skillPath = join(skillsSource, skillDir);
    const metadata = getSkillMetadata(skillPath);
    if (metadata) {
      skills.push(metadata);
    }
  }

  return skills;
}

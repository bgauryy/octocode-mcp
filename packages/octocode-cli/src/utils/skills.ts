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
import { paths } from 'octocode-shared';
import { trySafe } from './try-safe.js';
import { parseSkillFrontmatter } from './parsers/frontmatter.js';
import { z } from 'zod/v4';

const OCTOCODE_DIR =
  paths.home || process.env.OCTOCODE_HOME || join(HOME, '.octocode');
const CONFIG_FILE = paths.cliConfig || join(OCTOCODE_DIR, 'config.json');

const OctocodeConfigSchema = z
  .object({
    skillsDestDir: z.string().optional(),
  })
  .passthrough();

type OctocodeConfig = z.infer<typeof OctocodeConfigSchema>;

function loadConfig(): OctocodeConfig {
  return trySafe(() => {
    if (existsSync(CONFIG_FILE)) {
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = OctocodeConfigSchema.safeParse(JSON.parse(content));
      return parsed.success ? parsed.data : {};
    }
    return {};
  }, {});
}

function saveConfig(config: OctocodeConfig): void {
  trySafe(() => {
    if (!existsSync(OCTOCODE_DIR)) {
      mkdirSync(OCTOCODE_DIR, { recursive: true, mode: 0o700 });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    return true;
  }, false);
}

export function setCustomSkillsDestDir(path: string | null): void {
  const config = loadConfig();
  if (path) {
    config.skillsDestDir = path;
  } else {
    delete config.skillsDestDir;
  }
  saveConfig(config);
}

export function getCustomSkillsDestDir(): string | null {
  const config = loadConfig();
  return config.skillsDestDir || null;
}

export function getDefaultSkillsDestDir(): string {
  if (isWindows) {
    const appData = getAppDataPath();
    return join(appData, 'Claude', 'skills');
  }
  return join(HOME, '.claude', 'skills');
}

interface SkillMetadata {
  name: string;
  description: string;
  folder: string;
}

export function getSkillsSourcePath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  const candidates = [
    join(currentDir, '..', 'skills'),
    join(currentDir, '..', '..', '..', '..', 'skills'),
    join(currentDir, '..', '..', '..', 'skills'),
  ];

  for (const candidate of candidates) {
    if (dirExists(candidate)) {
      return candidate;
    }
  }

  throw new Error('Skills directory not found');
}

export function copySkills(destDir: string): boolean {
  const skillsSource = getSkillsSourcePath();
  return copyDirectory(skillsSource, destDir);
}

export function copySkill(skillName: string, destDir: string): boolean {
  const skillsSource = getSkillsSourcePath();
  const skillPath = join(skillsSource, skillName);

  if (!dirExists(skillPath)) {
    return false;
  }

  const destPath = join(destDir, skillName);
  return copyDirectory(skillPath, destPath);
}

export function getAvailableSkills(): string[] {
  const skillsSource = getSkillsSourcePath();
  return listSubdirectories(skillsSource).filter(name =>
    name.startsWith('octocode-')
  );
}

export function getSkillsSourceDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentFile);

  const candidates = [
    resolve(currentDir, '..', 'skills'),
    resolve(currentDir, '..', '..', '..', '..', 'skills'),
    resolve(currentDir, '..', '..', '..', 'skills'),
  ];

  for (const candidate of candidates) {
    if (dirExists(candidate)) {
      return candidate;
    }
  }

  return resolve(currentDir, '..', 'skills');
}

export function getSkillsDestDir(): string {
  const customPath = getCustomSkillsDestDir();
  if (customPath) {
    return customPath;
  }
  return getDefaultSkillsDestDir();
}

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
  if (!parsed?.name || !parsed.description) {
    return null;
  }

  return {
    name: parsed.name,
    description: parsed.description,
    folder: skillPath.split('/').pop() || '',
  };
}

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

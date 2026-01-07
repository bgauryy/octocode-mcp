/**
 * Skills Fetch Utilities
 * Fetch skills from GitHub marketplace repositories and local bundled sources
 */

import type {
  MarketplaceSource,
  MarketplaceSkill,
} from '../configs/skills-marketplace.js';
import { isLocalSource } from '../configs/skills-marketplace.js';
import {
  dirExists,
  writeFileContent,
  readFileContent,
  fileExists,
  copyDirectory,
} from './fs.js';
import { join } from 'node:path';
import { mkdirSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import { getSkillsSourcePath, getAvailableSkills } from './skills.js';

// ============================================================================
// Cache Configuration
// ============================================================================

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

interface CachedSkillsData {
  timestamp: number;
  skills: MarketplaceSkill[];
}

/**
 * Get the cache directory for skills
 * Uses npm cache location or falls back to ~/.cache/octocode
 */
function getCacheDir(): string {
  const home = os.homedir();

  // Try npm cache location first
  const npmCacheDir = process.env.npm_config_cache || join(home, '.npm');
  const npmOctocodeCache = join(npmCacheDir, '_cacache', 'octocode-skills');

  // Fallback to standard cache location
  const isWindows = os.platform() === 'win32';
  const fallbackCache = isWindows
    ? join(
        process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'),
        'octocode',
        'cache',
        'skills'
      )
    : join(home, '.cache', 'octocode', 'skills');

  // Prefer npm cache if parent exists, otherwise use fallback
  if (dirExists(npmCacheDir)) {
    return npmOctocodeCache;
  }

  return fallbackCache;
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): string {
  const cacheDir = getCacheDir();
  if (!dirExists(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

/**
 * Get cache file path for a marketplace source
 */
function getCacheFilePath(source: MarketplaceSource): string {
  const cacheDir = ensureCacheDir();
  return join(cacheDir, `${source.id}.json`);
}

/**
 * Check if cached data is still valid (less than 24 hours old)
 */
function isCacheValid(cacheFile: string): boolean {
  try {
    if (!fileExists(cacheFile)) {
      return false;
    }

    const stats = statSync(cacheFile);
    const age = Date.now() - stats.mtimeMs;
    return age < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Read cached skills data
 */
function readCachedSkills(
  source: MarketplaceSource
): MarketplaceSkill[] | null {
  try {
    const cacheFile = getCacheFilePath(source);

    if (!isCacheValid(cacheFile)) {
      return null;
    }

    const content = readFileContent(cacheFile);
    if (!content) {
      return null;
    }

    const data = JSON.parse(content) as CachedSkillsData;

    // Double-check timestamp in data
    if (Date.now() - data.timestamp > CACHE_TTL_MS) {
      return null;
    }

    // Restore source reference (not serialized)
    return data.skills.map(skill => ({
      ...skill,
      source,
    }));
  } catch {
    return null;
  }
}

/**
 * Write skills data to cache
 */
function writeCachedSkills(
  source: MarketplaceSource,
  skills: MarketplaceSkill[]
): void {
  try {
    const cacheFile = getCacheFilePath(source);

    // Remove source from skills before caching (circular reference)
    const skillsToCache = skills.map(({ source: _, ...rest }) => rest);

    const data: CachedSkillsData = {
      timestamp: Date.now(),
      skills: skillsToCache as MarketplaceSkill[],
    };

    writeFileContent(cacheFile, JSON.stringify(data, null, 2));
  } catch {
    // Silently fail cache write - not critical
  }
}

/**
 * GitHub API response for directory listing
 */
interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

/**
 * Parse YAML frontmatter from markdown content
 */
function parseFrontmatter(
  content: string
): { description: string; category?: string } | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  const catMatch = frontmatter.match(/^category:\s*(.+)$/m);

  if (!descMatch) return null;

  return {
    description: descMatch[1].trim(),
    category: catMatch?.[1].trim(),
  };
}

/**
 * Format skill name from filename or folder name
 * e.g., "code-review.md" -> "Code Review"
 */
function formatSkillName(name: string): string {
  return name
    .replace(/\.md$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ============================================================================
// Local Skills Fetching
// ============================================================================

/**
 * Fetch skills from local bundled source
 * Reads directly from the skills directory bundled with the CLI
 */
function fetchLocalSkills(source: MarketplaceSource): MarketplaceSkill[] {
  try {
    const skillsSourcePath = getSkillsSourcePath();
    const availableSkills = getAvailableSkills();
    const skills: MarketplaceSkill[] = [];

    for (const skillFolder of availableSkills) {
      const skillPath = join(skillsSourcePath, skillFolder);
      const skillMdPath = join(skillPath, 'SKILL.md');

      if (fileExists(skillMdPath)) {
        const content = readFileContent(skillMdPath);
        if (content) {
          const meta = parseFrontmatter(content);
          skills.push({
            name: skillFolder,
            displayName: formatSkillName(skillFolder),
            description:
              meta?.description ||
              extractFirstParagraph(content) ||
              'No description',
            category: meta?.category || 'Official',
            path: skillFolder,
            source,
          });
        }
      }
    }

    return skills;
  } catch {
    return [];
  }
}

/**
 * Install a local skill (copy from bundled source)
 */
function installLocalSkill(
  skill: MarketplaceSkill,
  destDir: string
): { success: boolean; error?: string } {
  try {
    const skillsSourcePath = getSkillsSourcePath();
    const sourcePath = join(skillsSourcePath, skill.name);
    const destPath = join(destDir, skill.name);

    if (!dirExists(sourcePath)) {
      return { success: false, error: 'Skill not found in bundled source' };
    }

    copyDirectory(sourcePath, destPath);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch the directory tree from GitHub API
 * Uses the Trees API which doesn't require authentication for public repos
 */
export async function fetchMarketplaceTree(
  source: MarketplaceSource
): Promise<GitHubTreeItem[]> {
  const apiUrl = `https://api.github.com/repos/${source.owner}/${source.repo}/git/trees/${source.branch}?recursive=1`;

  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'octocode-cli',
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('GitHub API rate limit exceeded. Try again later.');
    }
    throw new Error(`Failed to fetch marketplace: ${response.statusText}`);
  }

  const data = (await response.json()) as GitHubTreeResponse;
  return data.tree;
}

/**
 * Fetch raw file content from GitHub
 */
export async function fetchRawContent(
  source: MarketplaceSource,
  path: string
): Promise<string> {
  const rawUrl = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${source.branch}/${path}`;

  const response = await fetch(rawUrl, {
    headers: {
      'User-Agent': 'octocode-cli',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch content: ${response.statusText}`);
  }

  return response.text();
}

/**
 * Fetch skills index from a marketplace source
 * Returns a list of available skills with metadata
 * Uses 24-hour cache to reduce API calls
 * For local sources, reads directly from bundled files
 */
export async function fetchMarketplaceSkills(
  source: MarketplaceSource,
  options: { skipCache?: boolean } = {}
): Promise<MarketplaceSkill[]> {
  // Handle local sources - read directly from bundled files
  if (isLocalSource(source)) {
    return fetchLocalSkills(source);
  }

  // Check cache first (unless skipCache is true)
  if (!options.skipCache) {
    const cached = readCachedSkills(source);
    if (cached) {
      return cached;
    }
  }

  const tree = await fetchMarketplaceTree(source);
  const skills: MarketplaceSkill[] = [];

  if (source.skillPattern === 'flat-md') {
    // Flat .md files in a directory (buildwithclaude pattern)
    const prefix = source.skillsPath ? `${source.skillsPath}/` : '';
    const mdFiles = tree.filter(
      item =>
        item.type === 'blob' &&
        item.path.startsWith(prefix) &&
        item.path.endsWith('.md') &&
        !item.path.includes('/') === (prefix === '') &&
        (prefix === '' || item.path.split('/').length === 2)
    );

    // Fetch first line of each file to get description
    // Limit to prevent too many requests
    const filesToFetch = mdFiles.slice(0, 100);

    for (const file of filesToFetch) {
      try {
        const content = await fetchRawContent(source, file.path);
        const meta = parseFrontmatter(content);
        const filename = file.path.split('/').pop() || file.path;

        skills.push({
          name: filename.replace(/\.md$/i, ''),
          displayName: formatSkillName(filename),
          description: meta?.description || 'No description available',
          category: meta?.category,
          path: file.path,
          source,
        });
      } catch {
        // Skip files that fail to fetch
      }
    }
  } else {
    // Skill folders pattern (SKILL.md in subfolders)
    const prefix = source.skillsPath ? `${source.skillsPath}/` : '';

    // Find directories that might contain skills
    const skillDirs = tree.filter(
      item =>
        item.type === 'tree' &&
        (prefix === '' || item.path.startsWith(prefix)) &&
        !item.path.includes('.') &&
        !item.path.startsWith('.')
    );

    // Look for SKILL.md or README.md in each directory
    for (const dir of skillDirs.slice(0, 50)) {
      const skillMdPath = `${dir.path}/SKILL.md`;
      const readmePath = `${dir.path}/README.md`;

      // Check if SKILL.md exists in tree
      const hasSkillMd = tree.some(
        item => item.path === skillMdPath && item.type === 'blob'
      );
      const hasReadme = tree.some(
        item => item.path === readmePath && item.type === 'blob'
      );

      const filePath = hasSkillMd ? skillMdPath : hasReadme ? readmePath : null;

      if (filePath) {
        try {
          const content = await fetchRawContent(source, filePath);
          const meta = parseFrontmatter(content);
          const folderName = dir.path.split('/').pop() || dir.path;

          skills.push({
            name: folderName,
            displayName: formatSkillName(folderName),
            description:
              meta?.description ||
              extractFirstParagraph(content) ||
              'No description',
            category: meta?.category,
            path: dir.path,
            source,
          });
        } catch {
          // Skip directories that fail to fetch
        }
      }
    }
  }

  // Write to cache for future requests
  writeCachedSkills(source, skills);

  return skills;
}

/**
 * Extract first paragraph from markdown content (after frontmatter)
 */
function extractFirstParagraph(content: string): string | null {
  // Remove frontmatter
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\s*/, '');

  // Find first non-empty paragraph
  const lines = withoutFrontmatter.split('\n');
  let paragraph = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (paragraph) break;
      continue;
    }
    if (trimmed.startsWith('#')) continue;
    paragraph += (paragraph ? ' ' : '') + trimmed;
  }

  return paragraph ? paragraph.slice(0, 200) : null;
}

/**
 * Download and install a skill from a marketplace
 * For local sources, copies from bundled files
 * For GitHub sources, downloads from remote repository
 */
export async function installMarketplaceSkill(
  skill: MarketplaceSkill,
  destDir: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const source = skill.source;

    // Handle local sources - copy from bundled files
    if (isLocalSource(source)) {
      return installLocalSkill(skill, destDir);
    }

    const tree = await fetchMarketplaceTree(source);

    // Create destination directory
    const skillDestDir = join(destDir, skill.name);
    if (!dirExists(skillDestDir)) {
      mkdirSync(skillDestDir, { recursive: true });
    }

    if (source.skillPattern === 'flat-md') {
      // Single file skill - download and create SKILL.md
      const content = await fetchRawContent(source, skill.path);
      const skillMdPath = join(skillDestDir, 'SKILL.md');
      writeFileContent(skillMdPath, content);
    } else {
      // Folder skill - download all files in the folder
      const prefix = `${skill.path}/`;
      const files = tree.filter(
        item => item.type === 'blob' && item.path.startsWith(prefix)
      );

      for (const file of files) {
        const relativePath = file.path.slice(prefix.length);
        const destPath = join(skillDestDir, relativePath);

        // Create subdirectories if needed
        const destSubDir = join(
          skillDestDir,
          relativePath.split('/').slice(0, -1).join('/')
        );
        if (destSubDir !== skillDestDir && !dirExists(destSubDir)) {
          mkdirSync(destSubDir, { recursive: true });
        }

        const content = await fetchRawContent(source, file.path);
        writeFileContent(destPath, content);
      }
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Search skills by query across all fetched skills
 */
export function searchSkills(
  skills: MarketplaceSkill[],
  query: string
): MarketplaceSkill[] {
  const lowerQuery = query.toLowerCase();
  return skills.filter(
    skill =>
      skill.name.toLowerCase().includes(lowerQuery) ||
      skill.displayName.toLowerCase().includes(lowerQuery) ||
      skill.description.toLowerCase().includes(lowerQuery) ||
      skill.category?.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Group skills by category
 */
export function groupSkillsByCategory(
  skills: MarketplaceSkill[]
): Map<string, MarketplaceSkill[]> {
  const grouped = new Map<string, MarketplaceSkill[]>();

  for (const skill of skills) {
    const category = skill.category || 'Other';
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(skill);
  }

  return grouped;
}

// ============================================================================
// Cache Management (exported)
// ============================================================================

/**
 * Clear all cached marketplace skills
 */
export function clearSkillsCache(): void {
  try {
    const cacheDir = getCacheDir();
    if (dirExists(cacheDir)) {
      const files = readdirSync(cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          unlinkSync(join(cacheDir, file));
        }
      }
    }
  } catch {
    // Silently fail
  }
}

/**
 * Clear cache for a specific marketplace source
 */
export function clearSourceCache(source: MarketplaceSource): void {
  try {
    const cacheFile = getCacheFilePath(source);
    if (fileExists(cacheFile)) {
      unlinkSync(cacheFile);
    }
  } catch {
    // Silently fail
  }
}

/**
 * Get cache info for a marketplace source
 */
export function getCacheInfo(source: MarketplaceSource): {
  isCached: boolean;
  age: number | null;
  expiresIn: number | null;
} {
  try {
    const cacheFile = getCacheFilePath(source);

    if (!fileExists(cacheFile)) {
      return { isCached: false, age: null, expiresIn: null };
    }

    const stats = statSync(cacheFile);
    const age = Date.now() - stats.mtimeMs;
    const expiresIn = Math.max(0, CACHE_TTL_MS - age);

    return {
      isCached: age < CACHE_TTL_MS,
      age,
      expiresIn: age < CACHE_TTL_MS ? expiresIn : null,
    };
  } catch {
    return { isCached: false, age: null, expiresIn: null };
  }
}

/**
 * Get cache directory path (for display purposes)
 */
export function getSkillsCacheDir(): string {
  return getCacheDir();
}

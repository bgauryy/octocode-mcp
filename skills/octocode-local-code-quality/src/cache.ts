import fs from 'node:fs';
import path from 'node:path';

export interface CacheEntry {
  mtimeMs: number;
  sizeBytes: number;
  result: unknown;
}

export interface AnalysisCache {
  version: number;
  root: string;
  entries: Record<string, CacheEntry>;
}

const CACHE_VERSION = 1;

export function loadCache(root: string): AnalysisCache | null {
  const cachePath = path.join(root, '.octocode', 'scan', '.cache', 'analysis-cache.json');
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (data.version !== CACHE_VERSION || data.root !== root) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveCache(root: string, cache: AnalysisCache): void {
  const dir = path.join(root, '.octocode', 'scan', '.cache');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'analysis-cache.json'),
    JSON.stringify(cache),
    'utf8',
  );
}

export function clearCache(root: string): void {
  const cachePath = path.join(root, '.octocode', 'scan', '.cache', 'analysis-cache.json');
  try {
    fs.unlinkSync(cachePath);
  } catch {
    /* Cache file may not exist; ignore */
  }
}

export function isCacheHit(
  cache: AnalysisCache | null,
  relPath: string,
  stat: { mtimeMs: number; size: number },
): boolean {
  if (!cache) return false;
  const entry = cache.entries[relPath];
  if (!entry) return false;
  return entry.mtimeMs === stat.mtimeMs && entry.sizeBytes === stat.size;
}

export function getCachedResult(cache: AnalysisCache, relPath: string): unknown {
  return cache.entries[relPath]?.result;
}

export function setCacheEntry(
  cache: AnalysisCache,
  relPath: string,
  stat: { mtimeMs: number; size: number },
  result: unknown,
): void {
  cache.entries[relPath] = { mtimeMs: stat.mtimeMs, sizeBytes: stat.size, result };
}

export function createEmptyCache(root: string): AnalysisCache {
  return { version: CACHE_VERSION, root, entries: {} };
}

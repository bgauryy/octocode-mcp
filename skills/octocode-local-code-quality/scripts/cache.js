import fs from 'node:fs';
import path from 'node:path';
export const ANALYSIS_SCHEMA_VERSION = '1.1.0'; // Keep in sync with REPORT_SCHEMA_VERSION in index.ts
const CACHE_VERSION = 1;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export function loadCache(root) {
    const cachePath = path.join(root, '.octocode', 'scan', '.cache', 'analysis-cache.json');
    try {
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (data.version !== CACHE_VERSION || data.root !== root || data.schemaVersion !== ANALYSIS_SCHEMA_VERSION)
            return null;
        return data;
    }
    catch {
        return null;
    }
}
export function saveCache(root, cache) {
    const dir = path.join(root, '.octocode', 'scan', '.cache');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'analysis-cache.json'), JSON.stringify(cache), 'utf8');
}
export function clearCache(root) {
    const cachePath = path.join(root, '.octocode', 'scan', '.cache', 'analysis-cache.json');
    try {
        fs.unlinkSync(cachePath);
    }
    catch {
        /* Cache file may not exist; ignore */
    }
}
export function isCacheHit(cache, relPath, stat) {
    if (!cache)
        return false;
    const entry = cache.entries[relPath];
    if (!entry)
        return false;
    return entry.mtimeMs === stat.mtimeMs && entry.sizeBytes === stat.size;
}
export function getCachedResult(cache, relPath) {
    const entry = cache.entries[relPath];
    if (entry) {
        entry.lastAccessMs = Date.now();
    }
    return entry?.result;
}
export function setCacheEntry(cache, relPath, stat, result) {
    cache.entries[relPath] = { mtimeMs: stat.mtimeMs, sizeBytes: stat.size, result, lastAccessMs: Date.now() };
}
export function createEmptyCache(root) {
    return { version: CACHE_VERSION, schemaVersion: ANALYSIS_SCHEMA_VERSION, root, entries: {} };
}
export function garbageCollect(cache, maxAgeMs = DEFAULT_MAX_AGE_MS) {
    const now = Date.now();
    const keysToRemove = [];
    for (const [key, entry] of Object.entries(cache.entries)) {
        if (now - entry.lastAccessMs > maxAgeMs) {
            keysToRemove.push(key);
        }
    }
    for (const key of keysToRemove) {
        delete cache.entries[key];
    }
    return keysToRemove.length;
}

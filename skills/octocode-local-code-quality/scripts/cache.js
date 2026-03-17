import fs from 'node:fs';
import path from 'node:path';
const CACHE_VERSION = 1;
export function loadCache(root) {
    const cachePath = path.join(root, '.octocode', 'scan', '.cache', 'analysis-cache.json');
    try {
        const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (data.version !== CACHE_VERSION || data.root !== root)
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
    return cache.entries[relPath]?.result;
}
export function setCacheEntry(cache, relPath, stat, result) {
    cache.entries[relPath] = { mtimeMs: stat.mtimeMs, sizeBytes: stat.size, result };
}
export function createEmptyCache(root) {
    return { version: CACHE_VERSION, root, entries: {} };
}

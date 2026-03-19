import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  ANALYSIS_SCHEMA_VERSION,
  clearCache,
  createEmptyCache,
  garbageCollect,
  getCachedResult,
  isCacheHit,
  loadCache,
  saveCache,
  setCacheEntry,
} from './cache.js';

describe('cache', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-test-'));
  });

  describe('createEmptyCache', () => {
    it('includes schemaVersion', () => {
      const cache = createEmptyCache('/test');
      expect(cache.schemaVersion).toBe(ANALYSIS_SCHEMA_VERSION);
      expect(cache.version).toBe(1);
      expect(cache.root).toBe('/test');
      expect(cache.entries).toEqual({});
    });
  });

  describe('loadCache', () => {
    it('returns null for schema version mismatch', () => {
      const cache = createEmptyCache(tmpDir);
      saveCache(tmpDir, cache);

      const cachePath = path.join(tmpDir, '.octocode', 'scan', '.cache', 'analysis-cache.json');
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      data.schemaVersion = '0.0.0';
      fs.writeFileSync(cachePath, JSON.stringify(data), 'utf8');

      expect(loadCache(tmpDir)).toBeNull();
    });

    it('returns null for version mismatch', () => {
      const cache = createEmptyCache(tmpDir);
      saveCache(tmpDir, cache);

      const cachePath = path.join(tmpDir, '.octocode', 'scan', '.cache', 'analysis-cache.json');
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      data.version = 999;
      fs.writeFileSync(cachePath, JSON.stringify(data), 'utf8');

      expect(loadCache(tmpDir)).toBeNull();
    });

    it('returns null for root mismatch', () => {
      const cache = createEmptyCache('/a');
      saveCache(tmpDir, cache);

      expect(loadCache('/b')).toBeNull();
    });

    it('returns valid cache', () => {
      const cache = createEmptyCache(tmpDir);
      setCacheEntry(cache, 'file.ts', { mtimeMs: 100, size: 50 }, { issues: [] });
      saveCache(tmpDir, cache);

      const loaded = loadCache(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.root).toBe(tmpDir);
      expect(loaded!.schemaVersion).toBe(ANALYSIS_SCHEMA_VERSION);
      expect(loaded!.entries['file.ts'].result).toEqual({ issues: [] });
    });
  });

  describe('setCacheEntry', () => {
    it('sets lastAccessMs', () => {
      const cache = createEmptyCache('/test');
      const before = Date.now();
      setCacheEntry(cache, 'a.ts', { mtimeMs: 1, size: 100 }, {});
      const after = Date.now();

      const entry = cache.entries['a.ts'];
      expect(entry.lastAccessMs).toBeGreaterThanOrEqual(before);
      expect(entry.lastAccessMs).toBeLessThanOrEqual(after);
    });
  });

  describe('getCachedResult', () => {
    it('refreshes lastAccessMs on read', () => {
      const cache = createEmptyCache('/test');
      setCacheEntry(cache, 'b.ts', { mtimeMs: 2, size: 200 }, { data: 1 });

      cache.entries['b.ts'].lastAccessMs = 1000;

      const before = Date.now();
      const result = getCachedResult(cache, 'b.ts');
      const after = Date.now();

      expect(result).toEqual({ data: 1 });
      expect(cache.entries['b.ts'].lastAccessMs).toBeGreaterThanOrEqual(before);
      expect(cache.entries['b.ts'].lastAccessMs).toBeLessThanOrEqual(after);
    });

    it('returns undefined for missing entry', () => {
      const cache = createEmptyCache('/test');
      expect(getCachedResult(cache, 'missing.ts')).toBeUndefined();
    });
  });

  describe('garbageCollect', () => {
    it('removes old entries and keeps recent ones', () => {
      const cache = createEmptyCache('/test');
      setCacheEntry(cache, 'old.ts', { mtimeMs: 1, size: 100 }, {});
      cache.entries['old.ts'].lastAccessMs = Date.now() - 8 * 24 * 60 * 60 * 1000;

      setCacheEntry(cache, 'recent.ts', { mtimeMs: 2, size: 200 }, {});

      const removed = garbageCollect(cache);
      expect(removed).toBe(1);
      expect(cache.entries['old.ts']).toBeUndefined();
      expect(cache.entries['recent.ts']).toBeDefined();
    });

    it('returns 0 when no entries are expired', () => {
      const cache = createEmptyCache('/test');
      setCacheEntry(cache, 'a.ts', { mtimeMs: 1, size: 100 }, {});
      setCacheEntry(cache, 'b.ts', { mtimeMs: 2, size: 200 }, {});

      const removed = garbageCollect(cache);
      expect(removed).toBe(0);
      expect(Object.keys(cache.entries)).toHaveLength(2);
    });
  });

  describe('isCacheHit', () => {
    it('returns true when mtime and size match', () => {
      const cache = createEmptyCache('/test');
      setCacheEntry(cache, 'x.ts', { mtimeMs: 10, size: 50 }, {});
      expect(isCacheHit(cache, 'x.ts', { mtimeMs: 10, size: 50 })).toBe(true);
    });

    it('returns false when mtime differs', () => {
      const cache = createEmptyCache('/test');
      setCacheEntry(cache, 'x.ts', { mtimeMs: 10, size: 50 }, {});
      expect(isCacheHit(cache, 'x.ts', { mtimeMs: 99, size: 50 })).toBe(false);
    });

    it('returns false for null cache', () => {
      expect(isCacheHit(null, 'x.ts', { mtimeMs: 10, size: 50 })).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('removes the cache file', () => {
      const cache = createEmptyCache(tmpDir);
      saveCache(tmpDir, cache);

      const cachePath = path.join(tmpDir, '.octocode', 'scan', '.cache', 'analysis-cache.json');
      expect(fs.existsSync(cachePath)).toBe(true);

      clearCache(tmpDir);
      expect(fs.existsSync(cachePath)).toBe(false);
    });

    it('does not throw if cache file does not exist', () => {
      expect(() => clearCache(tmpDir)).not.toThrow();
    });
  });
});

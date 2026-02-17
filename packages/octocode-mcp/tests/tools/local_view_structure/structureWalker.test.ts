import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  walkDirectory,
  type WalkStats,
} from '../../../src/tools/local_view_structure/structureWalker.js';
import type { DirectoryEntry } from '../../../src/tools/local_view_structure/structureFilters.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('walkDirectory - WalkStats error tracking', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'walker-test-'));
  });

  it('should increment stats.skipped on lstat error', async () => {
    // Create a file, then make lstat fail by removing read permission on parent
    // Simpler: mock fs.promises.lstat to fail for a specific path
    await fs.promises.writeFile(path.join(tmpDir, 'good.txt'), 'hello');
    await fs.promises.writeFile(path.join(tmpDir, 'bad.txt'), 'world');

    const originalLstat = fs.promises.lstat;
    vi.spyOn(fs.promises, 'lstat').mockImplementation(
      async (p: fs.PathLike) => {
        if (String(p).endsWith('bad.txt')) {
          throw new Error('Permission denied');
        }
        return originalLstat(p);
      }
    );

    const entries: DirectoryEntry[] = [];
    const stats: WalkStats = { skipped: 0 };

    await walkDirectory(
      tmpDir,
      tmpDir,
      0,
      1,
      entries,
      100,
      false,
      false,
      stats
    );

    expect(stats.skipped).toBe(1);
    expect(entries.length).toBe(1);
    expect(entries[0]!.name).toBe('good.txt');

    vi.restoreAllMocks();
  });

  it('should increment stats.skipped on readdir error', async () => {
    const originalReaddir = fs.promises.readdir;
    vi.spyOn(fs.promises, 'readdir').mockImplementation(
      async (p: fs.PathLike, ...args: unknown[]) => {
        if (String(p) === tmpDir) {
          throw new Error('Permission denied');
        }
        return originalReaddir(p, ...(args as [never])) as never;
      }
    );

    const entries: DirectoryEntry[] = [];
    const stats: WalkStats = { skipped: 0 };

    await walkDirectory(
      tmpDir,
      tmpDir,
      0,
      1,
      entries,
      100,
      false,
      false,
      stats
    );

    expect(stats.skipped).toBe(1);
    expect(entries.length).toBe(0);

    vi.restoreAllMocks();
  });

  it('should work without stats param (backward compat)', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'file.txt'), 'content');

    const entries: DirectoryEntry[] = [];

    // No stats param — should not throw
    await walkDirectory(tmpDir, tmpDir, 0, 1, entries, 100, false, false);

    expect(entries.length).toBe(1);
  });

  it('should collect non-error entries alongside errors', async () => {
    await fs.promises.writeFile(path.join(tmpDir, 'a.txt'), 'aaa');
    await fs.promises.writeFile(path.join(tmpDir, 'b.txt'), 'bbb');
    await fs.promises.writeFile(path.join(tmpDir, 'c.txt'), 'ccc');

    const originalLstat = fs.promises.lstat;
    vi.spyOn(fs.promises, 'lstat').mockImplementation(
      async (p: fs.PathLike) => {
        if (String(p).endsWith('b.txt')) {
          throw new Error('Permission denied');
        }
        return originalLstat(p);
      }
    );

    const entries: DirectoryEntry[] = [];
    const stats: WalkStats = { skipped: 0 };

    await walkDirectory(
      tmpDir,
      tmpDir,
      0,
      1,
      entries,
      100,
      false,
      false,
      stats
    );

    expect(stats.skipped).toBe(1);
    expect(entries.length).toBe(2);
    const names = entries.map(e => e.name);
    expect(names).toContain('a.txt');
    expect(names).toContain('c.txt');

    vi.restoreAllMocks();
  });
});

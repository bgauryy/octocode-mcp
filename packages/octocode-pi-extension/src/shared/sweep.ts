import fs from 'node:fs';
import path from 'node:path';
import { processAlive } from './process.js';

/** Clearing out runtime files: aged output folders, a crashed process's leftovers, and moving a file across file systems. */

/** Removes entries of `dir` not modified for `maxAgeMs`, except those named in `keep`, with non-blocking calls. Never rejects. */
export async function sweepStaleOutputs(dir: string, maxAgeMs: number, keep: ReadonlySet<string> = new Set(), now = Date.now()): Promise<void> {
  let names: string[];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (keep.has(name)) continue;
    const file = path.join(dir, name);
    try {
      if (now - (await fs.promises.stat(file)).mtimeMs > maxAgeMs) await fs.promises.rm(file, { recursive: true, force: true });
    } catch {
      // Removed meanwhile, or not ours to remove.
    }
  }
}

/**
 * Removes entries of `dir` named `<pid>-…` whose process is gone and that are older than `maxAgeMs` (a crashed
 * session's leftovers); entries of live processes stay whatever their age. Never throws.
 */
export function sweepDeadOutputs(dir: string, maxAgeMs: number, now = Date.now()): void {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const pid = Number(/^(\d+)-/.exec(name)?.[1]);
    if (!pid || pid === process.pid || processAlive(pid)) continue;
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > maxAgeMs) fs.rmSync(file, { recursive: true, force: true });
    } catch {
      // Removed meanwhile, or not ours to remove.
    }
  }
}

/** Moves a file, copying across file systems; returns false when it could not. */
export function moveFile(from: string, to: string): boolean {
  try {
    fs.renameSync(from, to);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') return false;
    try {
      fs.copyFileSync(from, to);
      fs.rmSync(from, { force: true });
      return true;
    } catch {
      return false;
    }
  }
}

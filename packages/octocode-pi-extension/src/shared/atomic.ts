import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Crash-safe file replacement: write a sibling temp file, fsync it, rename it over the target and fsync the
 * directory. A reader sees the old bytes or the new ones, never a torn file. Symlinks are written through (the link
 * stays a link), and an existing file keeps its mode unless `mode` is set. `atomicWriteFile` can also check, just
 * before the rename, that the target still holds what was read. On any failure the target is untouched and no temp
 * file stays.
 */

interface AtomicWriteOptions {
  /** File mode of the result (e.g. `0o600` for credentials), applied exactly rather than through the umask. */
  mode?: number;
}

export function sha256(data: string | Uint8Array, encoding: 'hex' | 'base64url' = 'hex'): string {
  return createHash('sha256').update(data).digest(encoding);
}

/** The first 16 hex digits of the SHA-256: a short name for content. */
export const shortHash = (data: string | Uint8Array): string => sha256(data).slice(0, 16);

/** The SHA-256 of a regular file, streamed (a large file is never held whole), or undefined when it does not exist (or is not a file). */
export async function sha256File(file: string): Promise<string | undefined> {
  try {
    if (!(await fs.promises.stat(file)).isFile()) return undefined;
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
    return hash.digest('hex');
  } catch {
    return undefined;
  }
}

export function changedOnDisk(display: string): Error {
  return new Error(`${display} changed on disk since it was read. Read it again before modifying it.`);
}

/** A unique hidden temp path next to `file` (same directory, so a rename is atomic). */
export function tempSibling(file: string): string {
  return path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
}

/**
 * The filesystem steps of one write. `atomicWriteFileSync` and `atomicWriteFile` drive the same steps (`writeSteps`)
 * through a synchronous or a promise-returning implementation; every step returns its value or a promise of it.
 */
interface WriteIo {
  /** The file a write lands on: symlinks resolved (the link stays a link), `file` itself when it does not exist. */
  realpath(file: string): unknown;
  /** The permission bits of an existing file, else undefined. */
  mode(file: string): unknown;
  /** Create `temp` (exclusive), write `data`, set `mode` exactly when given (open() applies the umask), fsync, close. */
  write(temp: string, data: string | Uint8Array, mode: number | undefined): unknown;
  rename(from: string, to: string): unknown;
  remove(file: string): unknown;
  /** fsync a directory, so the rename survives a crash; some filesystems cannot, and the rename is atomic anyway. */
  syncDirectory(dir: string): unknown;
}

const syncIo: WriteIo = {
  realpath: (file) => {
    try {
      return fs.realpathSync(file);
    } catch {
      return file;
    }
  },
  mode: (file) => {
    try {
      return fs.statSync(file).mode & 0o7777;
    } catch {
      return undefined;
    }
  },
  write: (temp, data, mode) => {
    const fd = fs.openSync(temp, 'wx', mode ?? 0o666);
    try {
      fs.writeFileSync(fd, data);
      if (mode !== undefined) fs.fchmodSync(fd, mode);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  },
  rename: (from, to) => fs.renameSync(from, to),
  remove: (file) => fs.rmSync(file, { force: true }),
  syncDirectory: (dir) => {
    if (process.platform === 'win32') return;
    try {
      const fd = fs.openSync(dir, 'r');
      try {
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      // See WriteIo.syncDirectory.
    }
  },
};

const asyncIo: WriteIo = {
  realpath: (file) => fs.promises.realpath(file).catch(() => file),
  mode: (file) => fs.promises.stat(file).then((stat) => stat.mode & 0o7777, () => undefined),
  write: async (temp, data, mode) => {
    const handle = await fs.promises.open(temp, 'wx', mode ?? 0o666);
    try {
      await handle.writeFile(data);
      if (mode !== undefined) await handle.chmod(mode);
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  rename: (from, to) => fs.promises.rename(from, to),
  remove: (file) => fs.promises.rm(file, { force: true }),
  syncDirectory: async (dir) => {
    if (process.platform === 'win32') return;
    const handle = await fs.promises.open(dir, 'r').catch(() => undefined);
    try {
      await handle?.sync();
    } catch {
      // See WriteIo.syncDirectory.
    } finally {
      await handle?.close();
    }
  },
};

/**
 * The one write sequence: each `yield` hands a step's result (or promise) to the driver and gets its value back.
 * `check` runs on the real target after the temp file is complete and before the rename.
 */
function* writeSteps(io: WriteIo, file: string, data: string | Uint8Array, options: AtomicWriteOptions, check?: (target: string) => unknown): Generator<unknown, void, unknown> {
  const target = (yield io.realpath(file)) as string;
  const temp = tempSibling(target);
  const mode = options.mode ?? ((yield io.mode(target)) as number | undefined);
  try {
    yield io.write(temp, data, mode);
    if (check) yield check(target);
    yield io.rename(temp, target);
  } catch (error) {
    yield io.remove(temp);
    throw error;
  }
  yield io.syncDirectory(path.dirname(target));
}

/**
 * Synchronous crash-safe write without a content check. A concurrent writer's update can be replaced whole, so a file
 * other processes also write (the trust store) needs its caller to re-read, merge and verify.
 */
export function atomicWriteFileSync(file: string, data: string | Uint8Array, options: AtomicWriteOptions = {}): void {
  const steps = writeSteps(syncIo, file, data, options);
  // A synchronous step has already run (or thrown inside the generator) when it is yielded: pass its value back.
  for (let step = steps.next(); !step.done; step = steps.next(step.value));
}

/**
 * Replace `file` with `data` atomically. `expectedSha`: a SHA-256 the current content must still have, `null` when
 * the file must still not exist, undefined for no check.
 */
export async function atomicWriteFile(file: string, data: string | Uint8Array, expectedSha?: string | null, options: AtomicWriteOptions = {}): Promise<void> {
  const check =
    expectedSha === undefined
      ? undefined
      : async (target: string) => {
          if (((await sha256File(target)) ?? null) !== expectedSha) throw changedOnDisk(file);
        };
  const steps = writeSteps(asyncIo, file, data, options, check);
  let step = steps.next();
  while (!step.done) {
    let value: unknown;
    try {
      value = await step.value;
    } catch (error) {
      step = steps.throw(error);
      continue;
    }
    step = steps.next(value);
  }
}

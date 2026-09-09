import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const OID = /^[0-9a-f]{40}$/;
const MAX_SCAN_MULTIPLIER = 1000;

export interface HistoryMaintenanceResult {
  objects: Array<{ oid: string; bytes: number; modified_at: string }>;
  partial: boolean;
  next_cursor: string | null;
  quiescent: false;
  diagnostic?: { code: 'HISTORY_EVIDENCE_SCAN_LIMIT'; message: string; terminal?: boolean };
}

interface MaintenanceOptions {
  fs: typeof import('node:fs');
  git: typeof import('isomorphic-git');
  rootDir: string;
  gitdir: string;
  retainedOids: string[];
  graceMs: number;
  limit: number;
  cursor?: string;
  assertMetadataSafe: () => Promise<void>;
}

class ReachabilityLimit extends Error {}

async function allRefRoots(gitdir: string): Promise<string[]> {
  const roots: string[] = [];
  const visit = async (directory: string, prefix: string): Promise<void> => {
    let entries: import('node:fs').Dirent<string>[];
    try {
      entries = await readdir(directory, {
        encoding: 'utf8',
        withFileTypes: true,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path, `${prefix}/${entry.name}`);
      else if (prefix.startsWith('/octocode/')) {
        let value: string;
        try {
          value = (await readFile(path, 'utf8')).trim();
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT')
            throw new Error(`history ref disappeared: ${path}`);
          throw error;
        }
        if (!OID.test(value))
          throw new Error(`invalid history ref target: ${path}`);
        if (roots.length >= 10_000) throw new ReachabilityLimit('History ref traversal exceeded 10000 roots.');
        roots.push(value);
      }
    }
  };
  await visit(resolve(gitdir, 'refs'), '');
  return roots;
}

async function reachableObjects(
  options: MaintenanceOptions
): Promise<Set<string>> {
  const reachable = new Set<string>();
  const visit = async (oid: string): Promise<void> => {
    if (!OID.test(oid) || reachable.has(oid)) return;
    if (reachable.size >= 100_000) throw new ReachabilityLimit('History reachability exceeded 100000 objects.');
    reachable.add(oid);
    try {
      const object = await options.git.readObject({
        fs: options.fs,
        dir: options.rootDir,
        gitdir: options.gitdir,
        oid,
        format: 'content',
      });
      if (object.type === 'commit') {
        const commit = await options.git.readCommit({
          fs: options.fs,
          dir: options.rootDir,
          gitdir: options.gitdir,
          oid,
        });
        await visit(commit.commit.tree);
        for (const parent of commit.commit.parent) await visit(parent);
      } else if (object.type === 'tree') {
        const tree = await options.git.readTree({
          fs: options.fs,
          dir: options.rootDir,
          gitdir: options.gitdir,
          oid,
        });
        for (const entry of tree.tree) await visit(entry.oid);
      }
    } catch (error) {
      if (error instanceof ReachabilityLimit) throw error;
      throw new Error(
        `cannot prove history object reachability for ${oid}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  for (const oid of [
    ...options.retainedOids,
    ...(await allRefRoots(options.gitdir)),
  ])
    await visit(oid);
  return reachable;
}

export async function inspectOrphanObjects(
  options: MaintenanceOptions
): Promise<HistoryMaintenanceResult> {
  await options.assertMetadataSafe();
  let reachable: Set<string>;
  try { reachable = await reachableObjects(options); }
  catch (error) {
    if (!(error instanceof ReachabilityLimit)) throw error;
    return { objects: [], partial: true, next_cursor: null, quiescent: false,
      diagnostic: { code: 'HISTORY_EVIDENCE_SCAN_LIMIT', message: error.message, terminal: true } };
  }
  const candidates: Array<{ oid: string; bytes: number; modified_at: string }> =
    [];
  let directories: import('node:fs').Dirent<string>[];
  try {
    directories = await readdir(resolve(options.gitdir, 'objects'), {
      encoding: 'utf8',
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') directories = [];
    else throw error;
  }
  const cutoff = Date.now() - options.graceMs;
  let scanned = 0;
  let lastScanned: string | undefined;
  const scanLimit = Math.max(
    options.limit,
    options.limit * MAX_SCAN_MULTIPLIER
  );
  for (const directory of directories
    .filter(entry => entry.isDirectory() && /^[0-9a-f]{2}$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    let objects: import('node:fs').Dirent<string>[];
    try {
      objects = await readdir(
        resolve(options.gitdir, 'objects', directory.name),
        { encoding: 'utf8', withFileTypes: true }
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new Error(
          `history object directory disappeared: ${directory.name}`
        );
      throw error;
    }
    for (const object of objects
      .filter(entry => entry.isFile() && /^[0-9a-f]{38}$/.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const oid = `${directory.name}${object.name}`;
      if (options.cursor && oid <= options.cursor) continue;
      if (scanned >= scanLimit)
        return {
          objects: candidates,
          partial: true,
          next_cursor: lastScanned!,
          quiescent: false,
          diagnostic: {
            code: 'HISTORY_EVIDENCE_SCAN_LIMIT',
            message: `Evidence scan exceeded bounded work (${scanLimit} objects). Continue with next_cursor.`,
          },
        };
      lastScanned = oid;
      scanned += 1;
      if (reachable.has(oid)) continue;
      const info = await stat(
        resolve(options.gitdir, 'objects', directory.name, object.name)
      );
      if (info.mtimeMs <= cutoff) {
        candidates.push({
          oid,
          bytes: info.size,
          modified_at: new Date(info.mtimeMs).toISOString(),
        });
        if (candidates.length > options.limit) return {
          objects: candidates.slice(0, options.limit), partial: true,
          next_cursor: candidates[options.limit - 1]!.oid, quiescent: false,
        };
      }
    }
  }
  const page = candidates.slice(0, options.limit);
  return {
    objects: page,
    partial: candidates.length > options.limit,
    next_cursor:
      candidates.length > options.limit ? (page.at(-1)?.oid ?? null) : null,
    quiescent: false,
  };
}

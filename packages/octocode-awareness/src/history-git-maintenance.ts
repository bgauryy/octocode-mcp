import { lstat, opendir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readHistoryObject, parseHistoryCommit, parseHistoryTree, MAX_HISTORY_OBJECT_BYTES } from './history-git-object.js';
import { loadNativeFiles } from './native-files.js';

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
  gitdir: string;
  retainedOids: string[];
  graceMs: number;
  limit: number;
  cursor?: string;
  assertMetadataSafe: () => Promise<void>;
}

class ReachabilityLimit extends Error {}

async function boundedEntries(path: string, maximum = 100_000): Promise<import('node:fs').Dirent<string>[]> {
  const entries: import('node:fs').Dirent<string>[] = [];
  for await (const entry of await opendir(path)) {
    if (entries.length >= maximum) throw new ReachabilityLimit(`History directory enumeration exceeded ${maximum} entries.`);
    entries.push(entry);
  }
  return entries;
}

async function allRefRoots(gitdir: string): Promise<string[]> {
  const roots: string[] = [];
  const native = await loadNativeFiles();
  let scanned = 0;
  const deadline = Date.now() + 10_000;
  const visit = async (directory: string, prefix: string, depth = 0): Promise<void> => {
    if (depth > 128) throw new ReachabilityLimit('History ref traversal exceeded 128 directory levels.');
    let entries: import('node:fs').Dirent<string>[];
    try {
      entries = await boundedEntries(directory, 10_000);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      if (Date.now() >= deadline) throw new ReachabilityLimit('History ref traversal exceeded its time limit.');
      if (++scanned > 20_000) throw new ReachabilityLimit('History ref traversal exceeded 20000 entries.');
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('history ref must not be a symlink');
      if (entry.isDirectory()) await visit(path, `${prefix}/${entry.name}`, depth + 1);
      else if (prefix.startsWith('/octocode/')) {
        let value: string;
        try {
          const snapshot = await native.snapshotFile(path, 42, true);
          if (!snapshot.exists) throw new Error(`history ref disappeared: ${path}`);
          value = snapshot.content!.toString('utf8').trim();
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
  const pending = [...options.retainedOids, ...(await allRefRoots(options.gitdir))];
  const deadline = Date.now() + 10_000;
  let bytes = 0;
  while (pending.length) {
    const oid = pending.pop()!;
    if (!OID.test(oid)) throw new Error('invalid retained history object id');
    if (reachable.has(oid)) continue;
    if (reachable.size >= 100_000) throw new ReachabilityLimit('History reachability exceeded 100000 objects.');
    if (Date.now() >= deadline || bytes >= 64 * 1024 * 1024 || pending.length > 100_000) throw new ReachabilityLimit('History reachability exceeded its byte, time, or queue limit.');
    reachable.add(oid);
    try {
      const object = await readHistoryObject(options.gitdir, oid, Math.min(MAX_HISTORY_OBJECT_BYTES, 64 * 1024 * 1024 - bytes), true, undefined, Math.max(0, deadline - Date.now()));
      bytes += object.size;
      if (object.objectType === 'commit') {
        const commit = parseHistoryCommit(object);
        pending.push(commit.tree, ...commit.parents);
      } else if (object.objectType === 'tree') {
        for (const entry of parseHistoryTree(object)) pending.push(entry.oid);
      } else if (object.objectType !== 'blob') {
        throw new Error('unsupported private history object type');
      }
    } catch (error) {
      if (error instanceof ReachabilityLimit) throw error;
      if (error instanceof Error && /HISTORY_OBJECT_(?:LIMIT|TIME_LIMIT)/.test(error.message)) throw new ReachabilityLimit(error.message);
      throw new Error(
        `cannot prove history object reachability for ${oid}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return reachable;
}

async function inspectOrphanObjectsBounded(
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
    directories = await boundedEntries(resolve(options.gitdir, 'objects'), 1024);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') directories = [];
    else throw error;
  }
  const cutoff = Date.now() - options.graceMs;
  const deadline = Date.now() + 10_000;
  let inspectedBytes = 0;
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
      objects = await boundedEntries(resolve(options.gitdir, 'objects', directory.name));
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
      if (Date.now() >= deadline) throw new ReachabilityLimit('History orphan inspection exceeded its time limit.');
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
      const path = resolve(options.gitdir, 'objects', directory.name, object.name);
      const info = await lstat(path);
      if (!info.isFile()) throw new Error(`history object changed type: ${oid}`);
      inspectedBytes += info.size;
      if (inspectedBytes > 64 * 1024 * 1024) throw new ReachabilityLimit('History orphan inspection exceeded its byte limit.');
      const native = await loadNativeFiles();
      const snapshot = await native.snapshotFile(path, 17 * 1024 * 1024, false);
      const after = await lstat(path);
      if (!snapshot.exists || info.dev !== after.dev || info.ino !== after.ino || info.size !== after.size || info.mtimeMs !== after.mtimeMs || info.ctimeMs !== after.ctimeMs) throw new Error(`history object changed during inspection: ${oid}`);
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

export async function inspectOrphanObjects(options: MaintenanceOptions): Promise<HistoryMaintenanceResult> {
  try { return await inspectOrphanObjectsBounded(options); }
  catch (error) {
    if (!(error instanceof ReachabilityLimit)) throw error;
    return { objects: [], partial: true, next_cursor: null, quiescent: false,
      diagnostic: { code: 'HISTORY_EVIDENCE_SCAN_LIMIT', message: error.message, terminal: true } };
  }
}

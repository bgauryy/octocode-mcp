import fs from 'node:fs';
import { chmod, link, lstat, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { relative, resolve, sep } from 'node:path';
import * as git from 'isomorphic-git';
import { inspectOrphanObjects, type HistoryMaintenanceResult } from './history-git-maintenance.js';

export function historyGitBackend() {
  return { name: 'isomorphic-git', version: git.version(), bundled: true, system_git_required: false };
}

export type HistoryFileMode = '100644' | '100755' | '120000';

export interface HistoryTreeEntry {
  path: string;
  oid: string;
  mode: HistoryFileMode;
}

export interface HistoryBlob {
  oid: string;
  size: number;
}

export interface HistoryCommitInput {
  tree: string;
  parents?: string[];
  message: string;
  timestampMs?: number;
}

export interface HistoryCommit {
  oid: string;
  tree: string;
  parents: string[];
  message: string;
  timestampMs: number;
}

export interface HistoryGitStore {
  readonly rootDir: string;
  readonly gitdir: string;
  writeBlob(bytes: Uint8Array): Promise<HistoryBlob>;
  readBlob(oid: string, maxBytes?: number): Promise<Uint8Array>;
  writeTree(entries: HistoryTreeEntry[]): Promise<string>;
  readTree(oid: string): Promise<HistoryTreeEntry[]>;
  writeCommit(input: HistoryCommitInput): Promise<string>;
  readCommit(oid: string): Promise<HistoryCommit>;
  verifyObject(oid: string, expectedType?: 'blob' | 'tree' | 'commit'): Promise<boolean>;
  publishRef(ref: string, oid: string): Promise<void>;
  resolveRef(ref: string): Promise<string | null>;
  inspectOrphanObjects(options: { retainedOids: string[]; graceMs: number; limit: number; cursor?: string }): Promise<HistoryMaintenanceResult>;
}

export interface OpenHistoryGitStoreOptions {
  historyRoot: string;
  storeId: string;
  workspaceId: string;
  boundaryRoot?: string;
}

const OID = /^[0-9a-f]{40}$/;
const HISTORY_REF = /^refs\/octocode\/[0-9a-f]{64}\/(before|after)$/;
const initializationLocks = new Map<string, Promise<void>>();

function validateIdentity(label: string, value: string): void {
  if (!/^(?:[a-z][a-z0-9-]{0,63}|[0-9a-f]{64})$/.test(value)) throw new Error(`invalid ${label}: ${JSON.stringify(value)}`);
}

function validateOid(oid: string): void {
  if (!OID.test(oid)) throw new Error(`invalid object id: ${JSON.stringify(oid)}`);
}

async function rejectSymlink(path: string, label: string): Promise<void> {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`${label} must not be a symlink: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function privateObject(gitdir: string, oid: string): Promise<void> {
  const directory = resolve(gitdir, 'objects', oid.slice(0, 2));
  await rejectSymlink(directory, 'Git object directory');
  await chmod(directory, 0o700);
  await chmod(resolve(directory, oid.slice(2)), 0o600);
}

async function withInitializationLock(key: string, task: () => Promise<void>): Promise<void> {
  const previous = initializationLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolveLock => { release = resolveLock; });
  const next = previous.then(() => current);
  initializationLocks.set(key, next);
  await previous;
  try {
    await task();
  } finally {
    release();
    if (initializationLocks.get(key) === next) initializationLocks.delete(key);
  }
}

async function assertDirectoryChain(boundaryRoot: string, target: string, label: string): Promise<void> {
  const boundary = resolve(boundaryRoot);
  const destination = resolve(target);
  const remainder = relative(boundary, destination);
  if (remainder === '..' || remainder.startsWith(`..${sep}`) || resolve(boundary, remainder) !== destination) {
    throw new Error(`${label} escaped its boundary`);
  }
  let cursor = boundary;
  for (const part of remainder ? remainder.split(sep) : []) {
    await rejectSymlink(cursor, label);
    try {
      if (!(await stat(cursor)).isDirectory()) throw new Error(`${label} must be a directory: ${cursor}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    cursor = resolve(cursor, part);
  }
  await rejectSymlink(cursor, label);
  try {
    if (!(await stat(cursor)).isDirectory()) throw new Error(`${label} must be a directory: ${cursor}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function normalizeHistoryPath(value: string): string {
  if (!value || value.includes('\0') || value.includes('\\') || value.startsWith('/') || value.endsWith('/')) {
    throw new Error(`invalid history path: ${JSON.stringify(value)}`);
  }
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error(`invalid history path: ${JSON.stringify(value)}`);
  return parts.join('/');
}

type TreeNode = Map<string, TreeNode | HistoryTreeEntry>;

export async function openHistoryGitStore(options: OpenHistoryGitStoreOptions): Promise<HistoryGitStore> {
  validateIdentity('store id', options.storeId);
  validateIdentity('workspace id', options.workspaceId);
  const historyRoot = resolve(options.historyRoot);
  const boundaryRoot = options.boundaryRoot ? resolve(options.boundaryRoot) : undefined;
  if (boundaryRoot && historyRoot !== boundaryRoot && !historyRoot.startsWith(`${boundaryRoot}${sep}`)) throw new Error('history store escaped its boundary');
  const rootDir = resolve(historyRoot, options.storeId, options.workspaceId);
  if (rootDir !== historyRoot && !rootDir.startsWith(`${historyRoot}${sep}`)) throw new Error('history store escaped its root');
  const storeDir = resolve(historyRoot, options.storeId);
  const gitdir = resolve(rootDir, 'repo.git');
  if (boundaryRoot) await assertDirectoryChain(boundaryRoot, historyRoot, 'history boundary ancestor');
  await rejectSymlink(historyRoot, 'history root');
  await mkdir(historyRoot, { recursive: true, mode: 0o700 });
  await rejectSymlink(historyRoot, 'history root');
  await chmod(historyRoot, 0o700);
  await rejectSymlink(storeDir, 'history store directory');
  await mkdir(storeDir, { recursive: true, mode: 0o700 });
  await rejectSymlink(rootDir, 'history workspace directory');
  await mkdir(rootDir, { recursive: true, mode: 0o700 });
  const canonicalRoot = await realpath(historyRoot);
  const canonicalStore = await realpath(rootDir);
  if (!canonicalStore.startsWith(`${canonicalRoot}${sep}`)) throw new Error('history store resolved outside its root');
  await chmod(storeDir, 0o700);
  await chmod(rootDir, 0o700);
  const assertMetadataSafe = async (ref?: string): Promise<void> => {
    if (boundaryRoot) await assertDirectoryChain(boundaryRoot, historyRoot, 'history boundary ancestor');
    for (const [candidate, label] of [[historyRoot, 'history root'], [storeDir, 'history store directory'], [rootDir, 'history workspace directory'], [gitdir, 'Git directory'], [resolve(gitdir, 'objects'), 'Git objects directory'], [resolve(gitdir, 'refs'), 'Git refs directory']] as const) {
      await rejectSymlink(candidate, label);
    }
    try {
      for (const entry of await readdir(resolve(gitdir, 'objects'), { withFileTypes: true })) {
        if (entry.isSymbolicLink()) throw new Error(`Git object ancestor must not be a symlink: ${entry.name}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (ref) {
      let cursor = gitdir;
      for (const part of ref.split('/').slice(0, -1)) {
        cursor = resolve(cursor, part);
        await rejectSymlink(cursor, 'Git ref ancestor');
      }
    }
  };
  const markerPath = resolve(rootDir, 'history-store.json');
  const marker = { formatVersion: 1, storeId: options.storeId, workspaceId: options.workspaceId, objectFormat: 'sha1' } as const;
  const validateMarker = async (): Promise<void> => {
    const existing = JSON.parse(await readFile(markerPath, 'utf8')) as unknown;
    if (JSON.stringify(existing) !== JSON.stringify(marker)) throw new Error('history store identity marker does not match requested store');
  };
  const ensureMarker = async (): Promise<void> => {
    try {
      await validateMarker();
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const temporary = resolve(rootDir, `.history-store-${randomUUID()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(marker)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    try {
      await link(temporary, markerPath).catch(async error => {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        await validateMarker();
      });
    } finally {
      await rm(temporary, { force: true });
    }
  };
  await withInitializationLock(rootDir, async () => {
    await assertMetadataSafe();
    await ensureMarker();
    await rejectSymlink(gitdir, 'Git directory');
    await git.init({ fs, dir: rootDir, gitdir, bare: true, defaultBranch: 'octocode' });
    await Promise.all([mkdir(gitdir, { recursive: true, mode: 0o700 }), realpath(rootDir)]);
    await chmod(gitdir, 0o700);
    await assertMetadataSafe();
  });

  const writeTreeNode = async (node: TreeNode): Promise<string> => {
    await assertMetadataSafe();
    const tree: Array<{ mode: string; path: string; oid: string; type: 'blob' | 'tree' }> = [];
    for (const name of [...node.keys()].sort()) {
      const value = node.get(name)!;
      if (value instanceof Map) {
        tree.push({ mode: '040000', path: name, oid: await writeTreeNode(value), type: 'tree' });
      } else {
        tree.push({ mode: value.mode, path: name, oid: value.oid, type: 'blob' });
      }
    }
    const oid = await git.writeTree({ fs, dir: rootDir, gitdir, tree });
    await privateObject(gitdir, oid);
    return oid;
  };

  const resolveHistoryRef = async (ref: string): Promise<string | null> => {
    if (!HISTORY_REF.test(ref)) throw new Error(`invalid history ref: ${JSON.stringify(ref)}`);
    await assertMetadataSafe(ref);
    try {
      return await git.resolveRef({ fs, dir: rootDir, gitdir, ref });
    } catch (error) {
      if (error instanceof Error && /not found|could not find/i.test(error.message)) return null;
      throw error;
    }
  };

  return {
    rootDir,
    gitdir,
    async writeBlob(bytes) {
      await assertMetadataSafe();
      const copy = Uint8Array.from(bytes);
      const oid = await git.writeBlob({ fs, dir: rootDir, gitdir, blob: copy });
      await privateObject(gitdir, oid);
      return { oid, size: copy.byteLength };
    },
    async readBlob(oid, maxBytes = 16 * 1024 * 1024) {
      await assertMetadataSafe();
      validateOid(oid);
      const { blob } = await git.readBlob({ fs, dir: rootDir, gitdir, oid });
      if (blob.byteLength > maxBytes) throw new Error(`history blob exceeds read limit: ${blob.byteLength} > ${maxBytes}`);
      return Uint8Array.from(blob);
    },
    async writeTree(entries) {
      const root: TreeNode = new Map();
      const seen = new Set<string>();
      for (const raw of entries) {
        const entry = { ...raw, path: normalizeHistoryPath(raw.path) };
        validateOid(entry.oid);
        if (!['100644', '100755', '120000'].includes(entry.mode)) throw new Error(`invalid history mode: ${entry.mode}`);
        if (seen.has(entry.path)) throw new Error(`duplicate history path: ${entry.path}`);
        seen.add(entry.path);
        const parts = entry.path.split('/');
        let node = root;
        for (const part of parts.slice(0, -1)) {
          const existing = node.get(part);
          if (existing && !(existing instanceof Map)) throw new Error(`history path conflicts with file: ${entry.path}`);
          if (!existing) node.set(part, new Map());
          node = node.get(part) as TreeNode;
        }
        const leaf = parts.at(-1)!;
        if (node.has(leaf)) throw new Error(`history path conflicts with directory: ${entry.path}`);
        node.set(leaf, entry);
      }
      const oid = await writeTreeNode(root);
      await privateObject(gitdir, oid);
      return oid;
    },
    async readTree(oid) {
      await assertMetadataSafe();
      validateOid(oid);
      const result: HistoryTreeEntry[] = [];
      const visit = async (treeOid: string, prefix: string): Promise<void> => {
        const { tree } = await git.readTree({ fs, dir: rootDir, gitdir, oid: treeOid });
        for (const entry of tree) {
          const entryPath = prefix ? `${prefix}/${entry.path}` : entry.path;
          if (entry.type === 'tree') await visit(entry.oid, entryPath);
          else if (entry.type === 'blob' && ['100644', '100755', '120000'].includes(entry.mode)) {
            result.push({ path: entryPath, oid: entry.oid, mode: entry.mode as HistoryFileMode });
          }
        }
      };
      await visit(oid, '');
      return result.sort((a, b) => a.path.localeCompare(b.path));
    },
    async writeCommit(input) {
      await assertMetadataSafe();
      validateOid(input.tree);
      for (const parent of input.parents ?? []) validateOid(parent);
      const timestamp = Math.floor((input.timestampMs ?? Date.now()) / 1000);
      const person = { name: 'Octocode Awareness', email: 'awareness@localhost', timestamp, timezoneOffset: 0 };
      const oid = await git.writeCommit({ fs, dir: rootDir, gitdir, commit: { message: input.message, tree: input.tree, parent: input.parents ?? [], author: person, committer: person } });
      await privateObject(gitdir, oid);
      return oid;
    },
    async readCommit(oid) {
      await assertMetadataSafe();
      validateOid(oid);
      const value = await git.readCommit({ fs, dir: rootDir, gitdir, oid });
      return { oid: value.oid, tree: value.commit.tree, parents: value.commit.parent, message: value.commit.message, timestampMs: value.commit.committer.timestamp * 1000 };
    },
    async verifyObject(oid, expectedType) {
      try {
        await assertMetadataSafe();
        validateOid(oid);
        const object = await git.readObject({ fs, dir: rootDir, gitdir, oid, format: 'content' });
        return expectedType ? object.type === expectedType : true;
      } catch {
        return false;
      }
    },
    async inspectOrphanObjects({ retainedOids, graceMs, limit, cursor }) {
      return inspectOrphanObjects({ fs, git, rootDir, gitdir, retainedOids, graceMs, limit, cursor, assertMetadataSafe });
    },
    async publishRef(ref, oid) {
      if (!HISTORY_REF.test(ref)) throw new Error(`invalid history ref: ${JSON.stringify(ref)}`);
      validateOid(oid);
      await assertMetadataSafe(ref);
      if (await resolveHistoryRef(ref)) throw new Error(`history ref already exists: ${ref}`);
      const refPath = resolve(gitdir, ...ref.split('/'));
      const refDirectory = resolve(refPath, '..');
      await mkdir(refDirectory, { recursive: true, mode: 0o700 });
      await assertMetadataSafe(ref);
      const temporary = resolve(gitdir, `.octocode-ref-${randomUUID()}.tmp`);
      await writeFile(temporary, `${oid}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      try {
        await link(temporary, refPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`history ref already exists: ${ref}`);
        throw error;
      } finally {
        await rm(temporary, { force: true });
      }
    },
    resolveRef: resolveHistoryRef,
  };
}

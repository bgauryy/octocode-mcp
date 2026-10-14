import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFileSync } from '../shared/atomic.js';
import { globalPaths } from '../shared/home.js';
import { processAlive } from '../shared/process.js';

/** Where a running instance publishes how to reach it. Clients list this directory to discover instances. */
export interface InstanceRecord {
  id: string;
  pid: number;
  cwd: string;
  startedAt: number;
  protocol: number;
  /** Unix socket path (absent on Windows). */
  socket?: string;
  /** Loopback HTTP endpoint and its bearer token (absent unless HTTP is enabled). */
  http?: { url: string; token: string };
  session?: string;
}

/** The instance records: `<Octocode home>/pi-api` (OCTOCODE_HOME moves it with everything else). */
export const apiDir = (env: NodeJS.ProcessEnv = process.env): string => globalPaths(env).api;

export const instancesDir = (dir: string): string => path.join(dir, 'instances');
const recordFile = (dir: string, id: string): string => path.join(instancesDir(dir), `${id}.json`);

export const newInstanceId = (): string => `pi-${crypto.randomBytes(3).toString('hex')}`;
export const newToken = (): string => crypto.randomBytes(32).toString('base64url');

/** Create the directory tree owner-only. Sockets and tokens live here, so it must not be readable by other users. */
export function ensurePrivateDir(dir: string): void {
  fs.mkdirSync(instancesDir(dir), { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') {
    fs.chmodSync(dir, 0o700);
    fs.chmodSync(instancesDir(dir), 0o700);
  }
}

export function writeRecord(dir: string, record: InstanceRecord): void {
  ensurePrivateDir(dir);
  atomicWriteFileSync(recordFile(dir, record.id), JSON.stringify(record, null, 2), { mode: 0o600 });
}

export function removeRecord(dir: string, id: string): void {
  fs.rmSync(recordFile(dir, id), { force: true });
}

/** Live instances, oldest first. Records of dead processes are swept (with their socket files). */
export function listInstances(dir: string): InstanceRecord[] {
  let names: string[];
  try {
    names = fs.readdirSync(instancesDir(dir));
  } catch {
    return [];
  }
  const found: InstanceRecord[] = [];
  for (const name of names.filter((entry) => entry.endsWith('.json'))) {
    const file = path.join(instancesDir(dir), name);
    try {
      const record = JSON.parse(fs.readFileSync(file, 'utf8')) as InstanceRecord;
      if (typeof record.id !== 'string' || typeof record.pid !== 'number') continue;
      if (processAlive(record.pid)) found.push(record);
      else {
        fs.rmSync(file, { force: true });
        if (record.socket) removeSocket(record.socket);
      }
    } catch {
      // A record being written or corrupt: skip it.
    }
  }
  return found.sort((a, b) => a.startedAt - b.startedAt);
}

/** A fallback socket's private folder in the temp directory: `octocode-<uid>-XXXXXX`, made by `mkdtemp`. */
const SOCKET_DIR = /^octocode-\d+-[A-Za-z0-9]{6}$/;

/**
 * Unix socket paths are limited to ~104 bytes on macOS, so a deep OCTOCODE_HOME would fail to bind. The socket sits
 * next to the record when that fits and otherwise in a folder `mkdtemp` makes in the temp directory (mode 0700, and
 * its name is unguessable): a fixed name there could be taken by another local user before this process binds it.
 */
export function socketPath(dir: string, id: string): string {
  const preferred = path.join(dir, `${id}.sock`);
  if (Buffer.byteLength(preferred) <= 100) return preferred;
  const folder = fs.mkdtempSync(path.join(fs.realpathSync(process.env['TMPDIR'] ?? '/tmp'), `octocode-${process.getuid?.() ?? 0}-`));
  return path.join(folder, `${id}.sock`);
}

/** Removes a socket file, and the private temp folder `socketPath` made for it. */
export function removeSocket(file: string): void {
  fs.rmSync(file, { force: true });
  const folder = path.dirname(file);
  if (SOCKET_DIR.test(path.basename(folder))) fs.rmSync(folder, { recursive: true, force: true });
}

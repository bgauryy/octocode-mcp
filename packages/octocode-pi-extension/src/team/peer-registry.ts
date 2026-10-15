import fs from 'node:fs';
import path from 'node:path';
import { runningPid } from '../agentdb/liveness.js';

/**
 * The agents-communication package lists the non-default databases its live processes use (a session started with
 * `--database <file>`) as one `<pid>.json` per process in `<Octocode home>/agents-communication/active-databases/`.
 * The package writes it and owns the format (`scripts/docs/DB.md`, "Active database registry"); this only reads it:
 *
 *   { "version": 1, "database": "/abs/file.sqlite", "pid": 123, "started": "1791187200" | null, "updatedAt": 1791187200000 }
 *
 * `started` is the process start time in `processStartTime`'s format, `updatedAt` the last write in Unix milliseconds.
 */

/** The `version` of the entry format this reads; an entry with another version is ignored. */
export const PEER_REGISTRY_VERSION = 1;
/**
 * How long after its last write an entry of a process that is gone still counts: a lease lives at most 10 minutes past
 * the write that took it (a one-shot CLI call exits at once, its lease stays) and the package refreshes an entry at
 * most one minute behind its writes.
 */
export const PEER_REGISTRY_GRACE_MS = 600_000 + 60_000;
/** An entry is a few hundred bytes; a larger file is not one. */
const MAX_ENTRY_BYTES = 4096;

interface Entry {
  version: number;
  database: string;
  pid: number;
  started: string | null;
  updatedAt: number;
}

function parse(file: string): Entry | undefined {
  try {
    if (fs.statSync(file).size > MAX_ENTRY_BYTES) return undefined;
    const entry = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Entry> | null;
    if (!entry || entry.version !== PEER_REGISTRY_VERSION) return undefined;
    const { database, pid, started, updatedAt } = entry;
    if (typeof database !== 'string' || !path.isAbsolute(database)) return undefined;
    if (!Number.isInteger(pid) || pid! <= 0 || (started !== null && typeof started !== 'string') || !Number.isFinite(updatedAt)) return undefined;
    return { version: entry.version, database, pid: pid!, started: started ?? null, updatedAt: updatedAt! };
  } catch {
    return undefined;
  }
}

/** How long a process check (a `ps` call) is reused: the folder is listed on every edit check, the processes are not. */
const PROCESS_CHECK_MS = 5_000;

export class PeerRegistry {
  private readonly checks = new Map<string, { at: number; running: boolean }>();

  constructor(private readonly dir: string) {}

  /**
   * The databases of live entries, sorted and without repeats: an entry is live while it was written within the lease
   * grace, or its process still runs as the one that wrote it (`runningPid`). A missing folder, an unreadable file or an
   * unknown format lists nothing: the registry is advisory.
   */
  databases(now: number): string[] {
    let names: string[];
    try {
      names = fs.readdirSync(this.dir).filter((name) => name.endsWith('.json'));
    } catch {
      return [];
    }
    const databases = new Set<string>();
    const seen = new Set<string>();
    for (const name of names) {
      const entry = parse(path.join(this.dir, name));
      if (!entry) continue;
      const key = `${entry.pid}:${entry.started ?? ''}`;
      seen.add(key);
      if (now - entry.updatedAt <= PEER_REGISTRY_GRACE_MS || this.running(key, entry, now)) databases.add(entry.database);
    }
    for (const key of this.checks.keys()) if (!seen.has(key)) this.checks.delete(key);
    return [...databases].sort();
  }

  private running(key: string, entry: Entry, now: number): boolean {
    const known = this.checks.get(key);
    if (known && now - known.at < PROCESS_CHECK_MS) return known.running;
    const running = runningPid(entry.pid, entry.started) !== undefined;
    this.checks.set(key, { at: now, running });
    return running;
  }
}

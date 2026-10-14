import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { canonicalPath } from '../shared/home.js';
import { errorMessage, loadSqlite } from '../shared/util.js';
import { keysOverlap, leaseKey, type LeaseKind } from './lease-key.js';
import type { Lease } from './model.js';

/**
 * The octocode-agents-communication package keeps path leases for agents of every vendor (Claude, Codex, Pi) in one
 * SQLite database. A Pi session writes only after asking this: a live lease of another agent that covers the file
 * refuses the write, as one of Pi's own team reservations does. Advisory and one-way: the database is opened
 * read-only and never written, Pi's own leases stay in its team database, and a missing, unreadable or newer-than-known
 * database means "no peer lease" (the write goes ahead), never a blocked session.
 */

/** `PRAGMA application_id` of the package database (`scripts/schema.sql`: it spells "OCTO" ... "COMM"); a different file is not ours. */
export const PEER_APPLICATION_ID = 1329678147;
/** `PRAGMA user_version` of the schema this reads (`sessions` and `leases` as in that version); any other is skipped with one warning. */
export const PEER_SCHEMA_VERSION = 5;
/** How long a read waits for the package's writer: a refusal is advisory, so an edit never stalls on it. */
const BUSY_MS = 200;
/** After a failed open or read, how long before the next attempt: the file may be migrated or finish a write. */
const RETRY_MS = 30_000;

/** An active lease of the package: `owner` is the holder's package session id, and `name` and `vendor` (`claude`, `codex`, `pi`...) say who that is. */
export interface PeerLease extends Lease {
  name: string;
  vendor: string;
}

interface Row {
  id: number;
  path: string;
  kind: LeaseKind;
  pathKey: string;
  reasoning: string;
  acquiredAt: number;
  expiresAt: number;
  owner: string;
  name: string;
  vendor: string;
  vendorSession: string | null;
}

export interface PeerLeaseOptions {
  /** This Pi session's id: a package session bound to it (`vendorSession`) is this agent itself, whose leases never refuse its own edits. */
  self?: () => string | undefined;
  /** Shows a warning to the agent; false when it could not be shown yet (then the warning is offered again). */
  warn?: (text: string) => boolean;
  now?: () => number;
}

/** The key of an absolute, symlink-resolved path: its components below the filesystem root, as the package keys them. */
function absoluteKey(file: string): string {
  const absolute = canonicalPath(file);
  return leaseKey(absolute.slice(path.parse(absolute).root.length).split(path.sep));
}

export class PeerLeases {
  private db: DatabaseSync | undefined;
  /** No attempt to open or read the database before this time. */
  private retryAt = 0;
  private warned = false;

  constructor(private readonly file: string, private readonly options: PeerLeaseOptions = {}) {}

  /** The first live lease of another package session that covers `file` (one spelling of the path is as good as another), or undefined. */
  conflict(file: string): PeerLease | undefined {
    const now = (this.options.now ?? Date.now)();
    const db = this.open(now);
    if (!db) return undefined;
    try {
      const key = absoluteKey(file);
      const self = this.options.self?.();
      // Every active lease, not a query per file: the set is small, and one rule (`keysOverlap`) decides, as in the package.
      const rows = db
        .prepare(
          `SELECT l.id, l.path, l.kind, l.pathKey, l.reasoning, l.acquiredAt, l.expiresAt, s.id AS owner, s.name, s.vendor, s.vendorSession
           FROM leases l JOIN sessions s ON s.id = l.owner WHERE l.expiresAt > ?1 AND s.expiresAt > ?1 ORDER BY l.id`,
        )
        .all(now) as unknown as Row[];
      const hit = rows.find((row) => !(self !== undefined && row.vendorSession === self) && keysOverlap(row.pathKey, row.kind, key, 'file'));
      return hit && { id: hit.id, path: hit.path, kind: hit.kind, reason: hit.reasoning, acquiredAt: hit.acquiredAt, expiresAt: hit.expiresAt, owner: hit.owner, name: hit.name, vendor: hit.vendor };
    } catch (error) {
      this.fail(now, `could not be read (${errorMessage(error)})`);
      return undefined;
    }
  }

  close(): void {
    this.drop();
    this.retryAt = 0;
  }

  /** The read-only connection, opened on first use once the file exists and has the schema this reads. */
  private open(now: number): DatabaseSync | undefined {
    if (this.db) return this.db;
    if (now < this.retryAt || !fs.existsSync(this.file)) return undefined;
    let db: DatabaseSync | undefined;
    try {
      const { DatabaseSync: Database } = loadSqlite();
      db = new Database(this.file, { readOnly: true });
      db.exec(`PRAGMA busy_timeout=${BUSY_MS}`);
      const id = (db.prepare('PRAGMA application_id').get() as { application_id: number }).application_id;
      const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
      // A database the package has not initialized yet holds no leases.
      if (id === 0 && version === 0) {
        db.close();
        this.retryAt = now + RETRY_MS;
        return undefined;
      }
      if (id !== PEER_APPLICATION_ID || version !== PEER_SCHEMA_VERSION) {
        db.close();
        this.fail(now, `has application_id ${id} and schema version ${version}; this reads version ${PEER_SCHEMA_VERSION}`);
        return undefined;
      }
      return (this.db = db);
    } catch (error) {
      try { db?.close(); } catch { /* already closed */ }
      this.fail(now, `could not be opened (${errorMessage(error)})`);
      return undefined;
    }
  }

  private drop(): void {
    try { this.db?.close(); } catch { /* already closed */ }
    this.db = undefined;
  }

  /** Skips the database for a while, and says so once: until then its leases are not checked. */
  private fail(now: number, why: string): void {
    this.drop();
    this.retryAt = now + RETRY_MS;
    if (this.warned) return;
    this.warned = this.options.warn?.(`The agents-communication database ${this.file} ${why}: other agents' path leases are not checked before your edits.`) ?? true;
  }
}

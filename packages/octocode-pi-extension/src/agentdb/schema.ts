import type { DatabaseSync } from 'node:sqlite';
import { num, type Row } from './rows.js';

/**
 * The agent database's schema: durable sessions, backlog and memories, and the team's transient state (presence,
 * messages kept a day, leases, recent edits). There is one schema and no version number: opening a database of ours
 * adds what `SCHEMA` has and the file lacks (tables, columns, indexes, triggers), and never removes or rewrites
 * anything. Builds of different ages share one file (every running Pi opens it), so an older build must not drop a
 * newer build's columns or tables, nor a newer one rebuild an older one's: schema changes are additive (a new table,
 * a column with a default, an index). A file that is not ours is refused and never touched.
 */

/** The file is not an agent database this code may use (another app's file, or not SQLite). Not retried. */
export class AgentDbError extends Error {}

/** Marks the file as an Octocode for Pi agent database ("OcPg"); a file with another id is never touched. */
export const AGENT_APPLICATION_ID = 0x4f635067;

/**
 * Sessions (`pid_started`: the process start time, so a reused pid is not taken for the session; `unpriced`: part of
 * its usage came from a model without pricing), the backlog (`goal`: what done means; `started_at`: when it was last
 * claimed; `from_item`: the row id of the item it came from, cleared by the store when that item is removed) and its
 * notes (`kind`: the agent's text or the change log the store writes on every update), memories and the team tables
 * (`agents.cache_read`: prompt tokens read from cache).
 */
const SCHEMA = `
CREATE TABLE sessions (
  id TEXT PRIMARY KEY, branch TEXT, head TEXT,
  cost REAL NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0, files_changed INTEGER NOT NULL DEFAULT 0, pid INTEGER,
  pid_started TEXT, unpriced INTEGER NOT NULL DEFAULT 0);

CREATE TABLE backlog (
  id INTEGER PRIMARY KEY AUTOINCREMENT, repo_key TEXT NOT NULL, seq INTEGER NOT NULL,
  title TEXT NOT NULL, goal TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL CHECK(state IN ('backlog','todo','ongoing','done')),
  priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 0 AND 3), tags TEXT NOT NULL DEFAULT '',
  assignee TEXT, created_by TEXT NOT NULL, source_session TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, started_at INTEGER, done_at INTEGER,
  from_item INTEGER, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(repo_key, seq));
CREATE INDEX backlog_board ON backlog(repo_key, state, priority, updated_at);
CREATE INDEX backlog_from ON backlog(from_item) WHERE from_item IS NOT NULL;
CREATE TABLE backlog_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item INTEGER NOT NULL REFERENCES backlog(id) ON DELETE CASCADE,
  at INTEGER NOT NULL, author TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'note' CHECK(kind IN ('note','change')), text TEXT NOT NULL);
CREATE INDEX backlog_notes_item ON backlog_notes(item, at);

CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT, scope TEXT NOT NULL CHECK(scope IN ('global','project')),
  repo_key TEXT,
  kind TEXT NOT NULL DEFAULT 'fact' CHECK(kind IN ('preference','fact','decision','gotcha','procedure')),
  title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', keywords TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0, author TEXT NOT NULL, source_session TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_used INTEGER, use_count INTEGER NOT NULL DEFAULT 0);
CREATE INDEX memories_scope ON memories(scope, repo_key, updated_at DESC);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE agents (
  id TEXT PRIMARY KEY, workspace TEXT NOT NULL, role TEXT NOT NULL, parent_id TEXT, pid INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('idle','working')), task TEXT, activity TEXT,
  joined_at INTEGER NOT NULL, seen_at INTEGER NOT NULL,
  tool_calls INTEGER NOT NULL DEFAULT 0, input INTEGER NOT NULL DEFAULT 0, cache_read INTEGER NOT NULL DEFAULT 0, output INTEGER NOT NULL DEFAULT 0,
  cost REAL NOT NULL DEFAULT 0, unpriced INTEGER NOT NULL DEFAULT 0, model TEXT);
CREATE INDEX agents_scope ON agents(workspace, joined_at);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL, sender TEXT NOT NULL, body TEXT NOT NULL,
  reply_required INTEGER NOT NULL DEFAULT 1, reply_to INTEGER REFERENCES messages(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL);
CREATE INDEX messages_age ON messages(created_at);
CREATE TABLE deliveries (
  message INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE, recipient TEXT NOT NULL,
  delivered_at INTEGER, completed_at INTEGER, dead_at INTEGER, wake INTEGER, notified_at INTEGER, PRIMARY KEY(message, recipient));
CREATE INDEX deliveries_inbox ON deliveries(recipient, delivered_at);
CREATE INDEX deliveries_unnotified ON deliveries(message) WHERE dead_at IS NOT NULL AND notified_at IS NULL;
CREATE TABLE leases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL, path TEXT NOT NULL, path_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('file','tree')), owner TEXT NOT NULL, reason TEXT NOT NULL,
  acquired_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX leases_path ON leases(workspace, path_key);
CREATE INDEX leases_owner ON leases(owner);
CREATE TABLE edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL, path TEXT NOT NULL, agent TEXT NOT NULL, tool TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX edits_recent ON edits(workspace, at);
`;

/** The optional full-text index over memories: its table and triggers, owned by `ensureFts`, not by the reconcile. */
const FTS_OBJECTS = /^memories_fts(?:_|$)/;

const FTS = `
CREATE VIRTUAL TABLE memories_fts USING fts5(title, keywords, body, content='memories', content_rowid='id', tokenize='porter unicode61');
CREATE TRIGGER memories_fts_insert AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, keywords, body) VALUES (new.id, new.title, new.keywords, new.body);
END;
CREATE TRIGGER memories_fts_delete AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, keywords, body) VALUES ('delete', old.id, old.title, old.keywords, old.body);
END;
CREATE TRIGGER memories_fts_update AFTER UPDATE OF title, keywords, body ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, keywords, body) VALUES ('delete', old.id, old.title, old.keywords, old.body);
  INSERT INTO memories_fts(rowid, title, keywords, body) VALUES (new.id, new.title, new.keywords, new.body);
END;
INSERT INTO memories_fts(memories_fts) VALUES ('rebuild');
`;

const pragma = (db: DatabaseSync, name: string) => num((db.prepare(`PRAGMA ${name}`).get() as Row | undefined)?.[name]);

interface SchemaObject {
  type: 'table' | 'index' | 'trigger';
  name: string;
  tbl_name: string;
  sql: string;
}

const objects = (db: DatabaseSync): SchemaObject[] =>
  (db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table', 'index', 'trigger') AND sql IS NOT NULL AND substr(name, 1, 7) <> 'sqlite_'").all() as unknown as SchemaObject[]).filter(
    (object) => !FTS_OBJECTS.test(object.name),
  );
interface Column {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
}
const columns = (db: DatabaseSync, table: string): Column[] => db.prepare(`PRAGMA table_info(${quote(table)})`).all() as unknown as Column[];
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** `SCHEMA` as SQLite stores it, read from a scratch in-memory database. */
function reference(db: DatabaseSync): { objects: SchemaObject[]; columns: Map<string, Column[]> } {
  const Database = db.constructor as new (file: string) => DatabaseSync;
  const scratch = new Database(':memory:');
  try {
    scratch.exec(SCHEMA);
    const all = objects(scratch);
    return { objects: all, columns: new Map(all.filter((object) => object.type === 'table').map((table) => [table.name, columns(scratch, table.name)])) };
  } finally {
    scratch.close();
  }
}

/** The SQL that adds what `SCHEMA` has and `db` lacks, in order (tables, then columns, then indexes and triggers). */
function missing(db: DatabaseSync): string[] {
  const want = reference(db);
  const have = new Map(objects(db).map((object) => [object.name, object]));
  const steps: string[] = [];
  for (const table of want.objects.filter((object) => object.type === 'table')) {
    if (!have.has(table.name)) {
      steps.push(table.sql);
      continue;
    }
    const present = new Set(columns(db, table.name).map((column) => column.name));
    for (const column of want.columns.get(table.name)!) {
      if (present.has(column.name)) continue;
      // SQLite adds a NOT NULL column only with a default; without one it is added nullable rather than not at all.
      const notNull = column.notnull && column.dflt_value !== null ? ' NOT NULL' : '';
      const fallback = column.dflt_value !== null ? ` DEFAULT ${column.dflt_value}` : '';
      steps.push(`ALTER TABLE ${quote(table.name)} ADD COLUMN ${quote(column.name)} ${column.type}${notNull}${fallback}`);
    }
  }
  for (const object of want.objects.filter((each) => each.type !== 'table')) if (!have.has(object.name)) steps.push(object.sql);
  return steps;
}

/** Whether `db` is ours with all of `SCHEMA` and its full-text index: then opening it needs no write. */
export function schemaCurrent(db: DatabaseSync): boolean {
  return pragma(db, 'application_id') === AGENT_APPLICATION_ID && missing(db).length === 0 && ftsWhole(db);
}

/**
 * Adds to `db` what `SCHEMA` has and it lacks (run it inside one write transaction), refusing another app's file. Then
 * makes sure the memory full-text index exists when SQLite has FTS5; returns whether it does.
 */
export function ensureSchema(db: DatabaseSync, file: string): { fts: boolean } {
  const applicationId = pragma(db, 'application_id');
  if (applicationId !== AGENT_APPLICATION_ID) {
    const tables = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND substr(name, 1, 7) <> 'sqlite_' LIMIT 1").get();
    if (applicationId !== 0 || tables !== undefined) throw new AgentDbError(`${file} is not an Octocode agent database; set OCTOCODE_AGENT_DB to another file.`);
    db.exec(`PRAGMA application_id=${AGENT_APPLICATION_ID}`);
  }
  for (const step of missing(db)) db.exec(step);
  return { fts: ensureFts(db) };
}

const FTS_NAMES = ['memories_fts', 'memories_fts_insert', 'memories_fts_delete', 'memories_fts_update'];
const ftsWhole = (db: DatabaseSync) => {
  const present = new Set((db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'memories_fts%'").all() as Array<{ name: string }>).map((row) => row.name));
  return FTS_NAMES.every((name) => present.has(name));
};

/**
 * The optional FTS5 index over memories (external content, kept in sync by triggers), created whole when any part of
 * it is missing. False when this SQLite lacks FTS5 (then nothing is touched, even an index another process made).
 */
function ensureFts(db: DatabaseSync): boolean {
  if (ftsWhole(db)) return true;
  db.exec('SAVEPOINT fts');
  try {
    for (const trigger of FTS_NAMES.slice(1)) db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
    db.exec('DROP TABLE IF EXISTS memories_fts');
    db.exec(FTS);
    db.exec('RELEASE fts');
    return true;
  } catch {
    db.exec('ROLLBACK TO fts');
    db.exec('RELEASE fts');
    return false;
  }
}

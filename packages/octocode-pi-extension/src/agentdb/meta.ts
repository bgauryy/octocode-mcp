import type { DatabaseSync } from 'node:sqlite';

/** The `meta` table's value for `key` (settings and counters shared by every session), or undefined when none is set. */
export function readMeta(db: DatabaseSync, key: string): string | undefined {
  return (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined)?.value;
}

export function writeMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

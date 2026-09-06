import { DatabaseSync } from '@octocodeai/agent-contracts/sqlite';
import { FTS_SCHEMA_DDL, SCHEMA_DDL, SCHEMA_INDEX_DDL } from './db-schema.js';
import { readSchemaObjects, schemaObjectsFingerprint } from './db-introspection.js';
import { WORKER_LIFECYCLE_DDL } from './db-worker-schema.js';

/** Recognize exact canonical source shapes for explicit copy only, never opening/migrating them. */
export function assertCanonicalCopySource(source: DatabaseSync): void {
  const actual = readSchemaObjects(source);
  const expected = new DatabaseSync(':memory:');
  try {
    expected.exec(SCHEMA_DDL);
    expected.exec(SCHEMA_INDEX_DDL);
    if (actual.some(({ name }) => name === 'memories_fts')) expected.exec(FTS_SCHEMA_DDL);
    if (actual.some(({ name }) => name === 'worker_lifecycle_events')) expected.exec(WORKER_LIFECYCLE_DDL);
    const current = readSchemaObjects(expected);
    const prior = current.map((object) => object.name === 'hook_receipts'
      ? { ...object, sql: object.sql.replace("'claude','codex','copilot','cursor','gemini','opencode'", "'claude','codex','cursor'") }
      : object);
    const fingerprint = schemaObjectsFingerprint(actual);
    if (fingerprint !== schemaObjectsFingerprint(current) && fingerprint !== schemaObjectsFingerprint(prior)) {
      throw new Error('unsupported source schema: expected exact canonical schema or prior three-host hook receipt schema');
    }
  } finally { expected.close(); }
}

/** Keep monotonic transport positions even when pruning removed the highest rows. */
export function copySequenceHighWaterMarks(source: DatabaseSync, destination: DatabaseSync): void {
  if (!source.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'sqlite_sequence'").get()) return;
  const rows = source.prepare('SELECT name, seq FROM sqlite_sequence').all() as Array<{ name: string; seq: number | bigint }>;
  for (const row of rows) {
    if (row.name !== 'event_outbox' && row.name !== 'worker_lifecycle_events') continue;
    if (!destination.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(row.name)) continue;
    const existing = destination.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(row.name) as { seq: number | bigint } | undefined;
    if (!existing) destination.prepare('INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)').run(row.name, row.seq);
    else if (row.seq > existing.seq) destination.prepare('UPDATE sqlite_sequence SET seq = ? WHERE name = ?').run(row.seq, row.name);
  }
}

import { AGENT_APPLICATION_ID, readSchemaObjects, assertSchemaObjects } from '@octocodeai/agent-contracts/schema';
import { AWARENESS_APPLICATION_ID } from './storage-scope.js';
import type { TableInfoRow } from './types/work-maintenance.js';
import { DatabaseSync } from '@octocodeai/agent-contracts/sqlite';
import { FTS_SCHEMA_DDL, SCHEMA_DDL, SCHEMA_INDEX_DDL } from './db-schema.js';
import { WORKER_LIFECYCLE_DDL } from './db-worker-schema.js';

export function tableColumns(db: DatabaseSync, tableName: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as unknown as TableInfoRow[];
  return new Set(rows.map((row) => row.name));
}

export interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
}

let _canonicalColumns: Map<string, ColumnInfo[]> | undefined;

/** Desired columns per table, derived from the executable DDL. */
export function canonicalColumns(): Map<string, ColumnInfo[]> {
  if (_canonicalColumns) return _canonicalColumns;
  const canonical = new DatabaseSync(':memory:');
  try {
    canonical.exec(SCHEMA_DDL);
    const tables = canonical.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    ).all() as unknown as Array<{ name: string }>;
    _canonicalColumns = new Map(tables.map(({ name }) => [
      name,
      canonical.prepare(`PRAGMA table_info(${name})`).all() as unknown as ColumnInfo[],
    ]));
    return _canonicalColumns;
  } finally {
    canonical.close();
  }
}

export function assertCanonicalRelationContract(
  db: DatabaseSync,
  relations?: SchemaIdentity['relations'],
): void {
  const actualRows = relations ?? readSchemaIdentity(db).relations;
  const expected = new Set(canonicalColumns().keys());
  const actual = new Set(actualRows.map(({ name }) => name));
  const missing = [...expected].filter((name) => !actual.has(name));
  const unexpected = actualRows.filter(({ name, type }) => (
    type !== 'table' || (!expected.has(name) && name !== 'memories_fts' && name !== 'worker_lifecycle_events')
  ));
  if (missing.length === 0 && unexpected.length === 0) return;
  const details = [
    missing.length > 0 ? `missing: ${missing.join(', ')}` : null,
    unexpected.length > 0 ? `unexpected: ${unexpected.map(({ name }) => name).join(', ')}` : null,
  ].filter((value): value is string => value !== null).join('; ');
  throw new Error(`canonical relation contract mismatch (${details})`);
}

export function assertCanonicalSchemaFingerprint(db: DatabaseSync): void {
  assertSchemaFingerprint(db, false);
}

function assertSchemaFingerprint(db: DatabaseSync, previousHistorySchema: boolean): void {
  const objects = readSchemaObjects(db);
  const canonical = new DatabaseSync(':memory:');
  try {
    canonical.exec(SCHEMA_DDL);
    canonical.exec(SCHEMA_INDEX_DDL);
    if (previousHistorySchema) canonical.exec('DROP TABLE local_history_durability');
    if (objects.some(({ name }) => name === 'memories_fts')) canonical.exec(FTS_SCHEMA_DDL);
    if (objects.some(({ name }) => name === 'worker_lifecycle_events')) canonical.exec(WORKER_LIFECYCLE_DDL);
    assertSchemaObjects(objects, readSchemaObjects(canonical));
  } finally {
    canonical.close();
  }
}

export interface SchemaIdentity {
  applicationId: number;
  relations: Array<{ name: string; type: string }>;
}

export type SchemaState = 'fresh' | 'canonical' | 'history-durability-upgrade';

export function readSchemaIdentity(db: DatabaseSync): SchemaIdentity {
  const application = db.prepare('PRAGMA application_id').get() as { application_id: number };
  const relations = readSchemaObjects(db).filter(({ type }) => type === 'table' || type === 'view').map(({ name, type }) => ({ name, type }));
  return {
    applicationId: application.application_id ?? 0,
    relations,
  };
}

export function inspectSchemaState(db: DatabaseSync): SchemaState {
  const identity = readSchemaIdentity(db);
  const expected = new Set(canonicalColumns().keys());
  const relationNames = new Set(identity.relations.map(({ name }) => name));
  const canonicalCount = [...expected].filter((name) => relationNames.has(name)).length;
  const knownAwarenessHost = identity.relations.every(({ name, type }) => (
    type === 'table' && (expected.has(name) || name === 'memories_fts' || name === 'worker_lifecycle_events')
  ));
  if (identity.applicationId === 0) {
    if (identity.relations.length === 0) return 'fresh';
    throw new Error('refusing unrecognized application_id=0 Awareness store; select a current canonical store or a fresh database. The database has not been changed.');
  }
  if (identity.applicationId === AWARENESS_APPLICATION_ID) {
    if (!knownAwarenessHost) {
      const names = identity.relations.map(({ name }) => name).join(', ');
      throw new Error(`refusing unrecognized or unrelated Awareness SQLite store; database consolidation may be required; relations: ${names}`);
    }
    if (canonicalCount !== expected.size) {
      if (canonicalCount === expected.size - 1 && !relationNames.has('local_history_durability')) {
        // Match the complete predecessor fingerprint before any migration write.
        assertSchemaFingerprint(db, true);
        return 'history-durability-upgrade';
      }
      throw new Error('Awareness requires the exact current canonical schema; this database is not supported and has not been changed. Select a fresh Awareness store.');
    }
    assertCanonicalRelationContract(db, identity.relations);
    assertCanonicalSchemaFingerprint(db);
    return 'canonical';
  }
  if (identity.applicationId === AGENT_APPLICATION_ID) {
    throw new Error(`refusing Agent SQLite store; Awareness requires application_id ${AWARENESS_APPLICATION_ID}`);
  }
  throw new Error(
    `refusing foreign Awareness application_id ${identity.applicationId}; expected ${AWARENESS_APPLICATION_ID}`,
  );
}

export function assertDatabaseIntegrity(db: DatabaseSync): void {
  const integrity = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>;
  const failures = integrity.filter(({ integrity_check }) => integrity_check !== 'ok');
  if (failures.length > 0) {
    throw new Error(`canonical integrity_check failed: ${failures.map((row) => row.integrity_check).join('; ')}`);
  }
  const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
  if (foreignKeys.length > 0) {
    throw new Error(`canonical foreign_key_check failed with ${foreignKeys.length} row(s)`);
  }
}

import { AGENT_APPLICATION_ID } from '@octocodeai/agent-contracts/schema';
import { AWARENESS_APPLICATION_ID } from './storage-scope.js';
import { createHash } from 'node:crypto';
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

export function normalizeSchemaSql(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/["`\[\]]/g, '')
    .replace(/\bIF\s+NOT\s+EXISTS\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim()
    .toLowerCase();
}

export interface SchemaObject {
  type: string;
  name: string;
  tableName: string;
  sql: string;
}

export function readSchemaObjects(db: DatabaseSync): SchemaObject[] {
  const rows = db.prepare(`
    SELECT type, name, tbl_name, sql
    FROM sqlite_schema
    WHERE type IN ('table', 'view', 'index', 'trigger')
      AND name NOT LIKE 'sqlite_%'
      AND name NOT GLOB 'memories_fts_*'
    ORDER BY type, name
  `).all() as Array<{ type: string; name: string; tbl_name: string; sql: string | null }>;
  return rows.map((row) => ({
    type: row.type,
    name: row.name,
    tableName: row.tbl_name,
    sql: normalizeSchemaSql(row.sql ?? ''),
  }));
}

export function schemaObjectsFingerprint(objects: SchemaObject[]): string {
  return createHash('sha256').update(JSON.stringify(objects)).digest('hex');
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
  const objects = readSchemaObjects(db);
  const canonical = new DatabaseSync(':memory:');
  try {
    canonical.exec(SCHEMA_DDL);
    canonical.exec(SCHEMA_INDEX_DDL);
    if (objects.some(({ name }) => name === 'memories_fts')) canonical.exec(FTS_SCHEMA_DDL);
    if (objects.some(({ name }) => name === 'worker_lifecycle_events')) canonical.exec(WORKER_LIFECYCLE_DDL);
    const expectedFingerprint = schemaObjectsFingerprint(readSchemaObjects(canonical));
    const actualFingerprint = schemaObjectsFingerprint(objects);
    if (actualFingerprint !== expectedFingerprint) {
      throw new Error(`canonical schema fingerprint mismatch (expected ${expectedFingerprint}, got ${actualFingerprint})`);
    }
  } finally {
    canonical.close();
  }
}

export interface SchemaIdentity {
  applicationId: number;
  relations: Array<{ name: string; type: string }>;
}

export type SchemaState = 'fresh' | 'canonical';

export function readSchemaIdentity(db: DatabaseSync): SchemaIdentity {
  const application = db.prepare('PRAGMA application_id').get() as { application_id: number };
  const relations = db.prepare(`
    SELECT name, type
    FROM sqlite_schema
    WHERE type IN ('table', 'view')
      AND name NOT LIKE 'sqlite_%'
      AND name NOT GLOB 'memories_fts_*'
      AND name NOT GLOB 'memory_fts_*'
    ORDER BY name
  `).all() as Array<{ name: string; type: string }>;
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
  if (identity.applicationId === AWARENESS_APPLICATION_ID || identity.applicationId === 0) {
    if (identity.relations.length === 0) return 'fresh';
    if (!knownAwarenessHost) {
      const names = identity.relations.map(({ name }) => name).join(', ');
      throw new Error(`refusing unrecognized or unrelated Awareness SQLite store; database consolidation may be required; relations: ${names}`);
    }
    if (canonicalCount !== expected.size) {
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

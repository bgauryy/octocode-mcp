import { chmodSync, existsSync, linkSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from '@octocodeai/agent-contracts/sqlite';
import { FTS_SCHEMA_DDL, SCHEMA_DDL, SCHEMA_INDEX_DDL } from './db-schema.js';
import { hasFts, rebuildFts } from './db-maintenance.js';
import { assertCanonicalRelationContract, assertCanonicalSchemaFingerprint } from './db-introspection.js';
import { AWARENESS_APPLICATION_ID } from './storage-scope.js';
import { WORKER_LIFECYCLE_DDL } from './db-worker-schema.js';
import { assertLogicalDestination, assertNoHistoryRowsForConsolidation, assertValidSource, copyCommonTables, tableNames } from './db-consolidation-validation.js';
import type { DatabaseConsolidationOptions } from './db-consolidation-validation.js';

export interface DatabaseConsolidationReport {
  dryRun: boolean;
  sourcePath: string;
  destinationPath: string;
  copiedTables: Readonly<Record<string, number>>;
  adoptedAgentIds: readonly string[];
}

function copySequenceHighWaterMarks(source: DatabaseSync, destination: DatabaseSync): void {
  if (!source.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='sqlite_sequence'").get()) return;
  const rows = source.prepare('SELECT name, seq FROM sqlite_sequence').all() as Array<{ name: string; seq: number | bigint }>;
  for (const row of rows) {
    if (row.name !== 'event_outbox' && row.name !== 'worker_lifecycle_events') continue;
    if (!destination.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(row.name)) continue;
    const existing = destination.prepare('SELECT seq FROM sqlite_sequence WHERE name=?').get(row.name) as { seq: number | bigint } | undefined;
    if (!existing) destination.prepare('INSERT INTO sqlite_sequence(name,seq) VALUES (?,?)').run(row.name, row.seq);
    else if (row.seq > existing.seq) destination.prepare('UPDATE sqlite_sequence SET seq=? WHERE name=?').run(row.seq, row.name);
  }
}

export function consolidateDatabase(sourcePath: string, destinationPath: string, options: DatabaseConsolidationOptions = {}): DatabaseConsolidationReport {
  if (sourcePath === destinationPath) throw new Error('destination must differ from source');
  if (!existsSync(sourcePath)) throw new Error(`source database does not exist: ${sourcePath}`);
  if (existsSync(destinationPath)) throw new Error(`destination already exists: ${destinationPath}`);
  const temporaryDirectory = mkdtempSync(join(dirname(destinationPath), '.awareness-consolidation-'));
  chmodSync(temporaryDirectory, 0o700);
  const temporaryPath = join(temporaryDirectory, basename(destinationPath));
  let source: DatabaseSync | undefined;
  let destination: DatabaseSync | undefined;
  try {
    source = new DatabaseSync(sourcePath, { readOnly: true });
    source.exec('BEGIN');
    assertValidSource(source);
    assertCanonicalRelationContract(source);
    assertCanonicalSchemaFingerprint(source);
    assertNoHistoryRowsForConsolidation(source);
    destination = new DatabaseSync(temporaryPath);
    destination.exec('PRAGMA foreign_keys=OFF');
    destination.exec('BEGIN IMMEDIATE');
    destination.exec(SCHEMA_DDL);
    destination.exec(SCHEMA_INDEX_DDL);
    if (new Set(tableNames(source)).has('worker_lifecycle_events')) destination.exec(WORKER_LIFECYCLE_DDL);
    const copiedTables = copyCommonTables(source, destination);
    copySequenceHighWaterMarks(source, destination);
    try { destination.exec(FTS_SCHEMA_DDL); } catch { /* FTS5 is optional in the embedded SQLite build. */ }
    if (hasFts(destination)) rebuildFts(destination);
    destination.exec(`PRAGMA application_id=${AWARENESS_APPLICATION_ID}`);
    assertLogicalDestination(destination);
    assertCanonicalRelationContract(destination);
    assertCanonicalSchemaFingerprint(destination);
    const integrity = destination.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    if (integrity.integrity_check !== 'ok') throw new Error(`destination integrity check failed: ${integrity.integrity_check}`);
    if (destination.prepare('PRAGMA foreign_key_check').all().length > 0) throw new Error('destination foreign key check failed');
    destination.exec('COMMIT');
    destination.exec('PRAGMA foreign_keys=ON');
    source.exec('COMMIT');
    destination.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    destination.close();
    destination = undefined;
    const report = { sourcePath, destinationPath, copiedTables, adoptedAgentIds: [], dryRun: options.dryRun === true };
    if (report.dryRun) return report;
    try { linkSync(temporaryPath, destinationPath); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`destination already exists: ${destinationPath}`);
      throw error;
    }
    return report;
  } catch (error) {
    try { destination?.exec('ROLLBACK'); } catch { /* no active destination transaction */ }
    try { source?.exec('ROLLBACK'); } catch { /* read snapshot ended */ }
    try { destination?.close(); } catch { /* cleanup only */ }
    throw error;
  } finally {
    try { destination?.close(); } catch { /* cleanup only */ }
    source?.close();
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

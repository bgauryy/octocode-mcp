import { createHash, randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { getDatabasePath } from './db-runtime.js';
import type { AttendResult, AttendUnchangedResult } from './attend-model.js';
import { AttendRevisionTokenSchema } from './schema/attend-revision.js';
const memoryStores = new WeakMap<DatabaseSync, string>();

function storeIdentity(db: DatabaseSync): string {
  const path = getDatabasePath(db);
  if (path !== ':memory:') {
    const realPath = realpathSync(path);
    const stat = statSync(realPath);
    return JSON.stringify([realPath, stat.dev, stat.ino, stat.birthtimeMs]);
  }
  let identity = memoryStores.get(db);
  if (!identity) { identity = randomUUID(); memoryStores.set(db, identity); }
  return identity;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(
    Object.entries(value)
      // These rows are derived views stamped at read time, unlike persisted rows.
      .filter(([key]) => key !== 'created_at' || !['pressure', 'projection'].includes(String((value as Record<string, unknown>)['item_type'])))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonical(child)]),
  );
  return value;
}
const hash = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

/** Fresh read comparison only: no retained packets, database writes or admission authority. */
export function withAttendRevision(input: {
  db: DatabaseSync;
  requested: string | undefined;
  scope: unknown;
  snapshot: unknown;
  result: Omit<AttendResult, 'revision' | 'unchanged'>;
  partial: boolean;
  stable: boolean;
}): AttendResult | AttendUnchangedResult {
  const scopeHash = hash({ version: 1, schema: input.db.prepare('PRAGMA schema_version').get()?.['schema_version'],
    store: storeIdentity(input.db), scope: input.scope });
  // Only the packet's presentation clock is excluded. Runtime observation timestamps,
  // lease deadlines, row updates and all other facts remain part of the comparison.
  const { generated_at: _generatedAt, ...packet } = input.result;
  const revision = `a1.${scopeHash}.${hash({ packet, snapshot: input.snapshot })}`;
  const parsed = AttendRevisionTokenSchema.safeParse(input.requested);
  const resetReason: AttendResult['reset_reason'] = input.requested === undefined ? undefined
    : !parsed.success ? 'invalid_revision'
      : parsed.data.split('.')[1] !== scopeHash ? 'scope_changed'
        : input.partial ? 'partial_snapshot'
          : !input.stable ? 'unstable_snapshot' : undefined;
  if (input.requested === revision && resetReason === undefined && !input.partial && input.stable) {
    return {
      ok: true, unchanged: true, revision, generated_at: input.result.generated_at,
      partial: input.result.partial,
      ...(input.result.partial_reasons ? { partial_reasons: input.result.partial_reasons } : {}),
      ...(input.result.evidence_omitted_count ? { evidence_omitted_count: input.result.evidence_omitted_count } : {}),
      workspace_path: input.result.workspace_path, advisory: true,
      unavailable: input.result.operational_state.unavailable,
      next: input.result.next,
      note: 'Scoped observation unchanged; retain the previous packet and recheck before mutations.',
    };
  }
  return { ...input.result, unchanged: false, revision, ...(resetReason ? { reset_reason: resetReason } : {}) };
}

import { z } from 'zod';
import { agentId, nonEmptyText, workspacePath } from './common.js';

const operationId = z.string().trim().min(1).max(128);
const filePath = z.string().min(1).max(1024);
const files = z.array(filePath).min(1).max(200);
const outcome = z.enum(['unknown', 'success', 'failure', 'interrupted', 'timeout']);
const oid = z.string().regex(/^[0-9a-f]{40}$/, 'Expected a lowercase 40-character Git object id.');
const fileMode = z.enum(['100644', '100755']);
export const historyExpectedSnapshotSchema = z.discriminatedUnion('status', [
  z.object({ path: filePath, status: z.literal('missing'), digest: z.string().length(64), size: z.literal(0) }).strict(),
  z.object({ path: filePath, status: z.literal('captured'), digest: z.string().regex(/^[0-9a-f]{64}$/), size: z.number().int().min(0), mode: fileMode }).strict(),
]);
export const historyRestoreTargetSchema = z.discriminatedUnion('status', [
  z.object({ path: filePath, status: z.literal('missing') }).strict(),
  z.object({ path: filePath, status: z.literal('captured'), oid, mode: fileMode }).strict(),
]);
export const historyExpectedSnapshotsSchema = z.array(historyExpectedSnapshotSchema).min(1).max(200);
export const historyRestoreTargetsSchema = z.array(historyRestoreTargetSchema).min(1).max(200);
export type HistoryExpectedSnapshot = z.infer<typeof historyExpectedSnapshotSchema>;
export type HistoryRestoreTarget = z.infer<typeof historyRestoreTargetSchema>;
const persistedJson = (schema: z.ZodType) => z.string().superRefine((value, context) => {
  try { schema.parse(JSON.parse(value)); }
  catch { context.addIssue({ code: 'custom', message: 'Stored JSON does not match its canonical schema.' }); }
});
const persistedHistoryFiles = persistedJson(z.array(z.string().min(1).max(1024)).min(1).max(200));

const captureContext = {
  workspace: workspacePath,
  agent_id: agentId,
  run_id: operationId.optional(),
  session_id: operationId.optional(),
  host: nonEmptyText('Host adapter.', 128).optional(),
  label: nonEmptyText('Human-readable capture label.', 256).optional(),
};

export const historyRequestSchemas = {
  history_status: z.object({ workspace: workspacePath }).strict(),
  history_capture: z.discriminatedUnion('phase', [
    z.object({ ...captureContext, phase: z.literal('before'), operation_id: operationId.optional(), file: files }).strict(),
    z.object({ ...captureContext, phase: z.literal('after'), operation_id: operationId, file: files.optional(), outcome }).strict(),
  ]),
  history_checkpoint: z.object({
    workspace: workspacePath,
    agent_id: agentId,
    operation_id: operationId.optional(),
    file: files,
    run_id: operationId.optional(),
    session_id: operationId.optional(),
    host: nonEmptyText('Host adapter.', 128).optional(),
    label: nonEmptyText('Human-readable checkpoint label.', 256).optional(),
  }).strict(),
  history_timeline: z.object({
    workspace: workspacePath,
    file: filePath.optional(),
    limit: z.number().int().min(1).max(200).default(20),
    cursor: z.string().trim().min(1).max(2048).optional(),
  }).strict(),
  history_read: z.object({
    workspace: workspacePath,
    operation_id: operationId,
    file: filePath,
    side: z.enum(['before', 'after']),
    offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
    limit: z.number().int().min(1).max(1_048_576).default(65_536),
  }).strict(),
  history_restore_preview: z.object({
    workspace: workspacePath,
    agent_id: agentId,
    operation_id: operationId,
    side: z.enum(['before', 'after']),
    file: files.optional(),
  }).strict(),
  history_restore_apply: z.object({
    workspace: workspacePath,
    agent_id: agentId,
    preview_id: operationId,
  }).strict(),
};

const nullableOid = oid.nullable();
const captureStatus = z.enum(['captured', 'missing', 'omitted', 'unstable', 'unknown']);
export const historyEntitySchemas = {
  local_history_operation: z.object({
    operation_id: operationId, workspace_path: workspacePath, agent_id: agentId,
    session_id: operationId.nullable(), run_id: operationId.nullable(), host: z.string().max(128).nullable(),
    kind: z.enum(['edit', 'checkpoint', 'restore']),
    status: z.enum(['capturing', 'open', 'complete', 'partial', 'failed']), outcome,
    request_hash: z.string().trim().min(1).max(128), label: z.string().max(256).nullable(),
    before_commit_oid: nullableOid, after_commit_oid: nullableOid,
    created_at: z.string(), updated_at: z.string(),
  }).strict(),
  local_history_version: z.object({
    operation_id: operationId, file_path: filePath, ordinal: z.number().int().min(0),
    before_oid: nullableOid, after_oid: nullableOid,
    before_mode: fileMode.nullable(), after_mode: fileMode.nullable(),
    before_status: captureStatus, after_status: captureStatus,
    before_reason: z.string().max(1000).nullable(), after_reason: z.string().max(1000).nullable(),
  }).strict(),
  local_history_restore: z.object({
    preview_id: operationId, workspace_path: workspacePath, agent_id: agentId,
    source_operation_id: operationId, side: z.enum(['before', 'after']),
    files_json: persistedHistoryFiles, expected_json: persistedJson(historyExpectedSnapshotsSchema), target_json: persistedJson(historyRestoreTargetsSchema),
    undo_operation_id: operationId.nullable(),
    lease_run_id: operationId.nullable(),
    status: z.enum(['ready', 'applying', 'applied', 'conflict', 'partial', 'failed']),
    expires_at: z.string(), result_json: z.string().nullable(), created_at: z.string(),
  }).strict(),
};

export const historySchemas = { ...historyRequestSchemas, ...historyEntitySchemas };
export type HistorySchemaName = keyof typeof historySchemas;
export type HistoryCaptureInput = z.infer<typeof historyRequestSchemas.history_capture>;
export type HistoryCheckpointInput = z.infer<typeof historyRequestSchemas.history_checkpoint>;
export type HistoryTimelineInput = z.infer<typeof historyRequestSchemas.history_timeline>;
export type HistoryReadInput = z.infer<typeof historyRequestSchemas.history_read>;
export type HistoryRestorePreviewInput = z.infer<typeof historyRequestSchemas.history_restore_preview>;
export type HistoryRestoreApplyInput = z.infer<typeof historyRequestSchemas.history_restore_apply>;

export interface HistoryRouteDescriptor {
  readonly command: string;
  readonly schema: keyof typeof historyRequestSchemas;
  readonly use: string;
  readonly example: string;
  readonly required: readonly string[];
  readonly allowed: readonly string[];
}

export const HISTORY_ROUTE_DESCRIPTORS = [
  { command: 'history status', schema: 'history_status', use: 'Report local-history capability and bounded counts.', example: 'npx @octocodeai/octocode-awareness history status --workspace "$PWD" --compact', required: ['workspace'], allowed: ['workspace'] },
  { command: 'history capture', schema: 'history_capture', use: 'Capture file state before or after one edit operation.', example: 'npx @octocodeai/octocode-awareness history capture --workspace "$PWD" --agent-id agent --phase before --file src/a.ts --compact', required: ['workspace', 'agent_id', 'phase'], allowed: ['workspace', 'agent_id', 'phase', 'operation_id', 'file', 'outcome', 'run_id', 'session_id', 'host', 'label'] },
  { command: 'history checkpoint', schema: 'history_checkpoint', use: 'Capture a named local file checkpoint.', example: 'npx @octocodeai/octocode-awareness history checkpoint --workspace "$PWD" --agent-id agent --file src/a.ts --compact', required: ['workspace', 'agent_id', 'file'], allowed: ['workspace', 'agent_id', 'operation_id', 'file', 'run_id', 'session_id', 'host', 'label'] },
  { command: 'history timeline', schema: 'history_timeline', use: 'List bounded local-history operations with an executable cursor.', example: 'npx @octocodeai/octocode-awareness history timeline --workspace "$PWD" --limit 20 --compact', required: ['workspace'], allowed: ['workspace', 'file', 'limit', 'cursor'] },
  { command: 'history read', schema: 'history_read', use: 'Read an exact bounded before/after file version.', example: 'npx @octocodeai/octocode-awareness history read --workspace "$PWD" --operation-id op_123 --file src/a.ts --side before --compact', required: ['workspace', 'operation_id', 'file', 'side'], allowed: ['workspace', 'operation_id', 'file', 'side', 'offset', 'limit'] },
  { command: 'history restore-preview', schema: 'history_restore_preview', use: 'Preview an explicit local-history restore without changing files.', example: 'npx @octocodeai/octocode-awareness history restore-preview --workspace "$PWD" --agent-id agent --operation-id op_123 --side before --compact', required: ['workspace', 'agent_id', 'operation_id', 'side'], allowed: ['workspace', 'agent_id', 'operation_id', 'side', 'file'] },
  { command: 'history restore-apply', schema: 'history_restore_apply', use: 'Apply a valid unexpired restore preview and record its receipt.', example: 'npx @octocodeai/octocode-awareness history restore-apply --workspace "$PWD" --agent-id agent --preview-id preview_123 --compact', required: ['workspace', 'agent_id', 'preview_id'], allowed: ['workspace', 'agent_id', 'preview_id'] },
] as const satisfies readonly HistoryRouteDescriptor[];

const EXAMPLE_OID = '0123456789abcdef0123456789abcdef01234567';
export const historyExamples: Record<keyof typeof historySchemas, unknown> = {
  history_status: { workspace: '/repo' },
  history_capture: { workspace: '/repo', agent_id: 'agent', phase: 'before', file: ['src/a.ts'] },
  history_checkpoint: { workspace: '/repo', agent_id: 'agent', file: ['src/a.ts'], label: 'before refactor' },
  history_timeline: { workspace: '/repo', limit: 20 },
  history_read: { workspace: '/repo', operation_id: 'op_123', file: 'src/a.ts', side: 'before', offset: 0, limit: 65_536 },
  history_restore_preview: { workspace: '/repo', agent_id: 'agent', operation_id: 'op_123', side: 'before' },
  history_restore_apply: { workspace: '/repo', agent_id: 'agent', preview_id: 'preview_123' },
  local_history_operation: { operation_id: 'op_123', workspace_path: '/repo', agent_id: 'agent', session_id: null, run_id: null, host: 'codex', kind: 'edit', status: 'complete', outcome: 'success', request_hash: 'request_hash', label: null, before_commit_oid: EXAMPLE_OID, after_commit_oid: EXAMPLE_OID, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:01Z' },
  local_history_version: { operation_id: 'op_123', file_path: 'src/a.ts', ordinal: 0, before_oid: EXAMPLE_OID, after_oid: EXAMPLE_OID, before_mode: '100644', after_mode: '100644', before_status: 'captured', after_status: 'captured', before_reason: null, after_reason: null },
  local_history_restore: { preview_id: 'preview_123', workspace_path: '/repo', agent_id: 'agent', source_operation_id: 'op_123', side: 'before', files_json: '["src/a.ts"]', expected_json: '[{"path":"src/a.ts","status":"missing","digest":"0000000000000000000000000000000000000000000000000000000000000000","size":0}]', target_json: '[{"path":"src/a.ts","status":"missing"}]', undo_operation_id: null, lease_run_id: null, status: 'ready', expires_at: '2026-01-01T00:05:00Z', result_json: null, created_at: '2026-01-01T00:00:00Z' },
};

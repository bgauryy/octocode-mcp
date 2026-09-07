import type { DatabaseSync } from '@octocodeai/agent-contracts/sqlite';
import { HISTORY_ROUTE_DESCRIPTORS, historyRequestSchemas } from './schema/definitions-history.js';
import { captureHistory } from './history-capture.js';
import { historyRead, historyStatus, historyTimeline } from './history-query.js';
import { applyHistoryRestore, previewHistoryRestore } from './history-restore.js';
import { createHistoryContext, HistoryError } from './history-store.js';

/** Async history boundary shared by CLI and native lifecycle adapters. Model input never carries runtime handles. */
export async function runAwarenessHistoryOperation(db: DatabaseSync, command: string, request: unknown): Promise<Record<string, unknown>> {
  const route = HISTORY_ROUTE_DESCRIPTORS.find(entry => entry.command === `history ${command}`);
  if (!route) throw new HistoryError('HISTORY_INVALID_REQUEST', 'Unknown history command. Use schema commands for supported routes.');
  const parsed = historyRequestSchemas[route.schema].safeParse(request);
  if (!parsed.success) throw new HistoryError('HISTORY_INVALID_REQUEST', parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  const ctx = createHistoryContext(db, parsed.data.workspace);
  switch (route.schema) {
    case 'history_status': return historyStatus(ctx);
    case 'history_capture': return captureHistory(ctx, historyRequestSchemas.history_capture.parse(parsed.data));
    case 'history_checkpoint': return captureHistory(ctx, historyRequestSchemas.history_checkpoint.parse(parsed.data));
    case 'history_timeline': return historyTimeline(ctx, historyRequestSchemas.history_timeline.parse(parsed.data));
    case 'history_read': return historyRead(ctx, historyRequestSchemas.history_read.parse(parsed.data));
    case 'history_restore_preview': return previewHistoryRestore(ctx, historyRequestSchemas.history_restore_preview.parse(parsed.data));
    case 'history_restore_apply': return applyHistoryRestore(ctx, historyRequestSchemas.history_restore_apply.parse(parsed.data));
  }
}

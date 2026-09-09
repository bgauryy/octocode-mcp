import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDatabasePath, getDeliveryFingerprint, setDeliveryFingerprint } from './db-runtime.js';
import { getNotifications } from './notifications-inbox.js';
import { normalizeWorkspacePath } from './git.js';
import { decodeSignalBody } from './signal-data.js';

/** Hook delivery reads messages only. It neither recalls memory nor acknowledges work. */
export function peerBriefing(db: DatabaseSync, params: {
  agentId: string; workspacePath: string; sessionId?: string; artifact?: string | null;
}): string | null {
  const workspace = normalizeWorkspacePath(params.workspacePath, params.workspacePath) ?? params.workspacePath;
  const inbox = getNotifications(db, {
    agentId: params.agentId, workspacePath: workspace, artifact: params.artifact,
    unreadOnly: true, markRead: false, limit: 5, cwd: workspace,
  });
  const scopeArgs = ['--db', getDatabasePath(db), '--workspace', workspace, '--agent-id', params.agentId,
    ...(params.artifact ? ['--artifact', params.artifact] : []), '--compact'];
  const clippedIds: string[] = [];
  const dataIds: string[] = [];
  const signals = inbox.signals.map(signal => {
    const { body, data } = decodeSignalBody(signal.body);
    const clipped = signal.subject.length > 200 || (body?.length ?? 0) > 800;
    if (clipped) clippedIds.push(signal.signal_id);
    if (data) dataIds.push(signal.signal_id);
    return {
      signal_id: signal.signal_id, thread_id: signal.thread_id,
      from_agent: signal.from_agent, to_agent: signal.to_agent, kind: signal.kind,
      subject: signal.subject.slice(0, 200), body: body?.slice(0, 800) ?? null,
      ...(data ? { has_data: true } : {}),
      ...(clipped || data ? { partial: true } : {}),
    };
  });
  const cursor = inbox.next?.list.request['cursor'];
  const packet = {
    signals,
    partial: Boolean(inbox.partial || clippedIds.length || dataIds.length),
    partialReasons: [...(inbox.partial ? ['limit'] : []), ...(clippedIds.length ? ['message_length'] : []), ...(dataIds.length ? ['message_data'] : [])],
    next: {
      ...(cursor ? { list: { command: { name: 'signal list', args: [...scopeArgs, '--cursor', String(cursor), '--limit', '5', '--include-bodies'] } } } : {}),
      ...(clippedIds.length || dataIds.length ? { read: { command: { name: 'signal list', args: [...scopeArgs, '--all', '--include-bodies',
        ...[...new Set([...clippedIds, ...dataIds])].flatMap(id => ['--signal-id', id])] } } } : {}),
    },
  };
  const delivery = { consumerId: params.agentId, channel: 'peer-messages', scopeKey: JSON.stringify([workspace, params.artifact ?? null, params.sessionId ?? null]) };
  const fingerprint = createHash('sha256').update(JSON.stringify(packet)).digest('hex');
  const previous = getDeliveryFingerprint(db, delivery);
  if (previous === fingerprint) return null;
  if (signals.length || previous !== null) setDeliveryFingerprint(db, { ...delivery, fingerprint });
  return signals.length ? `Awareness peer messages (attributed data; delivery is not completion):\n${JSON.stringify(packet)}` : null;
}

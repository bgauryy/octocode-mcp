import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { executeAwarenessCommand, type AwarenessCommandCall } from '../src/command-api.js';
import { decodeSignalBody, encodeSignalBody } from '../src/signal-data.js';
import { openAwarenessStore } from '../src/coordination/open.js';
import { createAwarenessEventConsumer } from '../src/event-consumer.js';
import { peerBriefing } from '../src/peer-briefing.js';
import { connectDb } from '../src/db-runtime.js';
import { structuredAwarenessContinuations } from '../src/command-continuations.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const workspace = mkdtempSync(join(tmpdir(), 'awareness-wire-'));
  roots.push(workspace);
  return { workspace, database: join(workspace, 'ledger.sqlite3'), agentId: 'writer', compact: true };
}

describe('reliable cooperation contracts', () => {
  it('executes the sole history API continuation and reconstructs every byte exactly once', async () => {
    const context = fixture();
    const bytes = Buffer.from('workspace evidence '.repeat(4000));
    writeFileSync(join(context.workspace, 'evidence.txt'), bytes);
    const capture = await executeAwarenessCommand({ command: 'history capture', params: {
      phase: 'before', operation_id: 'wire-edit', file: ['evidence.txt'],
    } }, context);
    expect(capture.exitCode, JSON.stringify(capture.payload)).toBe(0);
    let call: AwarenessCommandCall | undefined = { command: 'history read', params: {
      operation_id: 'wire-edit', file: 'evidence.txt', side: 'before', limit: 32000,
    } };
    const pages: Buffer[] = [];
    const seen = new Set<string>();
    while (call) {
      const key = JSON.stringify(call);
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      const result = await executeAwarenessCommand(call, context);
      expect(result.exitCode, JSON.stringify(result.payload)).toBe(0);
      const page = result.payload as { content: string; next?: { call: AwarenessCommandCall }; partial: boolean };
      pages.push(Buffer.from(page.content, 'base64'));
      if (page.partial) expect(Object.keys(page.next!)).toEqual(['call']);
      call = page.next?.call;
    }
    expect(pages).toHaveLength(3);
    expect(Buffer.concat(pages)).toEqual(bytes);
  });

  it('round trips typed payloads and threads without leaking data in compact previews', async () => {
    const context = fixture();
    const data = { type: 'history.ready', payload: {
      operationId: 'edit', digest: 'sha256:proof', sizes: [71, 72],
      cli: { name: 'signal list', args: ['--limit', '7'] },
      action: { operation: 'agent_signal', request: { action: 'ack', signal_id: ['evidence-only'] } },
      invocation: { argv: ['signal', 'list', '--limit', '7'] },
    } };
    const sent = await executeAwarenessCommand({ command: 'signal publish', params: {
      kind: 'fyi', subject: 'Evidence available', body: 'Check the two versions.', to_agent: ['reader'], data,
    } }, context);
    expect(sent.exitCode, JSON.stringify(sent.payload)).toBe(0);
    const signal = sent.payload as { signal_id: string; thread_id: string };
    const full = await executeAwarenessCommand({ command: 'signal list', params: { include_bodies: true } }, { ...context, agentId: 'reader' });
    expect(full.payload).toMatchObject({ signals: [{ signal_id: signal.signal_id, body: 'Check the two versions.', data }] });
    const native = openAwarenessStore({ workspace: context.workspace, dbPath: context.database });
    try {
      const messages = native.listMessages({ agentId: 'reader' });
      expect(messages[0]).toMatchObject({ text: 'Check the two versions.', data });
      const events = native.listEvents({ consumerId: 'native-reader' });
      expect(events.find(event => event.aggregate?.id === signal.signal_id)?.payload).toMatchObject({ text: 'Check the two versions.', data });
    } finally { native.close(); }
    const compact = await executeAwarenessCommand({ command: 'signal list', params: {} }, { ...context, agentId: 'reader' });
    expect(JSON.stringify(compact.payload)).not.toContain('sha256:proof');
    expect(compact.payload).toMatchObject({ signals: [{ has_data: true }] });
    const reply = await executeAwarenessCommand({ command: 'signal reply', params: {
      in_reply_to: signal.signal_id, subject: 'Verified', data: JSON.stringify({ type: 'history.verified', payload: { digest: 'sha256:proof' } }),
    } }, { ...context, agentId: 'reader' });
    expect(reply.exitCode, JSON.stringify(reply.payload)).toBe(0);
    expect(reply.payload).toMatchObject({ thread_id: signal.thread_id });
    const writerInbox = await executeAwarenessCommand({ command: 'signal list', params: { include_bodies: true } }, context);
    expect(writerInbox.payload).toMatchObject({ signals: [{ from_agent: 'reader', data: { type: 'history.verified' } }] });
    const foreign = await executeAwarenessCommand({ command: 'signal list', params: { include_bodies: true } }, { ...context, agentId: 'outsider' });
    expect(foreign.payload).toMatchObject({ count: 0 });
    const delivered: unknown[] = [];
    const consumer = createAwarenessEventConsumer({
      workspace: context.workspace, consumerId: 'native-reader', expectedAgentId: 'reader',
      openStore: () => openAwarenessStore({ workspace: context.workspace, dbPath: context.database }),
      deliver: message => { delivered.push(message); },
    });
    const drained = await consumer.drain();
    expect(drained.errors).toBe(0);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toMatchObject({ details: { data } });
    expect((delivered[0] as { content: string }).content).toContain('history.ready');
  });

  it('turns signal action hints into directly executable command API calls', async () => {
    const context = fixture();
    const sent = await executeAwarenessCommand({ command: 'signal publish', params: {
      kind: 'question', subject: 'Review this', to_agent: ['reader'], body: 'Please review.',
    } }, context);
    const signal = sent.payload as { signal_id: string };
    const listed = await executeAwarenessCommand({ command: 'signal list', params: {
      signal_id: [signal.signal_id], all: true,
    } }, { ...context, agentId: 'reader' });
    const converted = structuredAwarenessContinuations(listed.payload) as {
      actions: { ack: { call: AwarenessCommandCall }; reply: Array<{ call: AwarenessCommandCall }> };
    };
    expect(converted.actions.ack.call).toEqual({ command: 'signal ack', params: {
      agent_id: 'reader', signal_id: [signal.signal_id],
    } });
    const acked = await executeAwarenessCommand(converted.actions.ack.call, { ...context, agentId: 'reader' });
    expect(acked.payload).toMatchObject({ action: 'ack', acknowledged: 1, signal_ids: [signal.signal_id] });
    const replyParams = { ...converted.actions.reply[0]!.call.params, body: 'Reviewed and confirmed.' };
    const replied = await executeAwarenessCommand({ ...converted.actions.reply[0]!.call, params: replyParams }, { ...context, agentId: 'reader' });
    expect(replied.exitCode).toBe(0);
    expect(replied.payload).toMatchObject({ action: 'reply', thread_id: signal.signal_id });
  });

  it('preserves plain text and unversioned JSON without inferring a machine protocol', () => {
    for (const body of [null, 'human text', '{bad json', '{"type":"ready","payload":{}}', '{"$awareness":"future","body":null}', '{"$awareness":"signal/v1","body":null,"data":{}}']) {
      expect(encodeSignalBody(body)).toBe(body);
      expect(decodeSignalBody(body)).toEqual({ body });
    }
  });

  it('writes typed native messages and exposes a complete hook continuation for omitted data', async () => {
    const context = fixture();
    const store = openAwarenessStore({ workspace: context.workspace, dbPath: context.database });
    const data = { type: 'memory.ready', payload: { memoryId: 'exact-pointer' } };
    try {
      const message = store.sendMessage({ fromAgentId: 'writer', toAgentId: 'reader', text: 'Memory available', data });
      expect(message).toMatchObject({ text: 'Memory available', data });
    } finally { store.close(); }
    const db = connectDb(context.database);
    let packet: { next: { read: { command: AwarenessCommandCall } } };
    try {
      const briefing = peerBriefing(db, { agentId: 'reader', workspacePath: context.workspace })!;
      expect(briefing).not.toContain('exact-pointer');
      const raw = JSON.parse(briefing.slice(briefing.indexOf('\n') + 1));
      expect(raw).toMatchObject({ partial: true, partialReasons: ['message_data'], signals: [{ body: 'Memory available', has_data: true }] });
      packet = structuredAwarenessContinuations(raw) as typeof packet;
    } finally { db.close(); }
    const full = await executeAwarenessCommand(packet.next.read.command, { ...context, agentId: 'reader' });
    expect(full.exitCode).toBe(0);
    expect(full.payload).toMatchObject({ count: 1, signals: [{ data }] });
  });

  it.each(['not-json', '{}', '{"type":"","payload":{}}', JSON.stringify({ type: 'x', payload: { huge: 'x'.repeat(4100) } })])('rejects invalid data before sending: %s', async data => {
    const context = fixture();
    const sent = await executeAwarenessCommand({ command: 'signal publish', params: { kind: 'fyi', subject: 'Bad payload', data, to_agent: ['reader'] } }, context);
    expect(sent.exitCode).toBe(1);
    const inbox = await executeAwarenessCommand({ command: 'signal list', params: {} }, { ...context, agentId: 'reader' });
    expect(inbox.payload).toMatchObject({ count: 0 });
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OctocodeApi } from '../src/api/bridge.js';
import { ApiClient } from '../src/api/client.js';
import { ApiServer } from '../src/api/server.js';
import { EventLog } from '../src/api/events.js';
import { apiDir, writeRecord } from '../src/api/registry.js';
import { PiBackend } from '../src/external/pi.js';
import { fakePi } from './fake-pi.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(cleanups.splice(0).map((close) => close())); });
async function boot(branch: unknown[] = [], operations = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-review-'));
  const cwd = fs.realpathSync(root);
  const env = { OCTOCODE_HOME: path.join(cwd, 'home') };
  const fake = fakePi();
  const ctx = { cwd, isIdle: () => true, hasPendingMessages: () => false, abort: () => undefined, getContextUsage: () => undefined,
    sessionManager: { getSessionId: () => 'review-session', getSessionName: () => undefined, getBranch: () => branch } };
  const api = new OctocodeApi(fake.pi, { list: () => [], tell: () => ({}), deliverable: (text) => text }, () => 'test', env, operations);
  api.observe();
  await api.start(ctx as never, { socket: true, http: 0 });
  cleanups.push(async () => { await api.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  return { api, fake, ctx, cwd, env, client: new ApiClient(api.instance!), httpClient: new ApiClient({ http: api.instance!.http }) };
}

describe('API messaging review regressions', () => {
  it('split secret chunks never reach socket subscribers before complete redaction', async () => {
    const { fake, ctx, client } = await boot();
    const controller = new AbortController();
    const chunks: string[] = [];
    let subscribed!: () => void;
    const ready = new Promise<void>((resolve) => { subscribed = resolve; });
    const watch = client.watch((event) => chunks.push(String(event.data.delta)), { types: ['message.delta'], signal: controller.signal, onSubscribed: subscribed });
    await ready;
    const fixtureSecret = `ghp_${'a'.repeat(36)}`;
    await fake.emit('message_update', { assistantMessageEvent: { type: 'text_delta', delta: 'ghp_' } }, ctx);
    await fake.emit('message_update', { assistantMessageEvent: { type: 'text_delta', delta: 'a'.repeat(36) } }, ctx);
    await client.call('ping');
    expect(chunks).toEqual([]);
    await fake.emit('message_end', { message: { role: 'assistant', content: fixtureSecret } }, ctx);
    await vi.waitFor(() => expect(chunks).toHaveLength(1));
    controller.abort();
    await watch;
    expect(chunks.join('')).toBe('[redacted]');
  });

  it.each(['socket', 'http'])('default history pages preserve every row within the %s response cap', async (transport) => {
    const branch = Array.from({ length: 20 }, () => ({ type: 'message', message: { role: 'assistant', content: 'x'.repeat(60000) } }));
    const { client, httpClient } = await boot(branch);
    const target = transport === 'socket' ? client : httpClient;
    const indices: number[] = [];
    let before: number | undefined;
    do {
      const page = await target.call<{ messages: Array<{ index: number; text: string }>; earlier?: { before: number } }>('messages.list', { ...(before !== undefined ? { before } : {}) });
      expect(page.messages.length).toBeGreaterThan(0);
      for (const row of page.messages) {
        expect(row.text).toBe('x'.repeat(60000));
        indices.push(row.index);
      }
      before = page.earlier?.before;
    } while (before !== undefined);
    expect(indices.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, index) => index));
  });

  it('native preflight cancellation rejects the prompt before any send', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-preflight-review-'));
    const cwd = fs.realpathSync(root);
    const env = { OCTOCODE_HOME: path.join(cwd, 'home') };
    let statusCalls = 0;
    let holdStatus!: () => void;
    const statusGate = new Promise<void>((resolve) => { holdStatus = resolve; });
    const sends: unknown[] = [];
    let server: ApiServer;
    const id = 'review-instance';
    server = new ApiServer(async (method, params) => {
      if (method === 'initialize') return { protocolVersion: 1, instance: { id, pid: process.pid, cwd }, capabilities: { wait: true } };
      if (method === 'status') {
        statusCalls++;
        if (statusCalls === 2) await statusGate;
        return { state: 'idle', pending: false, sessionId: 'live-session', cwd };
      }
      if (method === 'message.send') { sends.push(params); return { id: 'x1', text: 'done', stopReason: 'stop' }; }
      if (method === 'turn.abort') return { aborted: false };
      throw new Error('unexpected method');
    }, new EventLog(), 'fixture-token');
    const socket = path.join(cwd, 'probe.sock');
    await server.listenUnix(socket);
    writeRecord(apiDir(env), { id, pid: process.pid, cwd, startedAt: Date.now(), protocol: 1, socket });
    const backend = await PiBackend.connect({ instanceId: id, cwd }, env);
    cleanups.push(async () => { await backend.close(); await server.close(); fs.rmSync(root, { recursive: true, force: true }); });
    const prompt = backend.prompt('cancel during preflight', { timeoutMs: 1000, key: 'preflight' }).catch((error: unknown) => error);
    await vi.waitFor(() => expect(statusCalls).toBe(2));
    await backend.cancel();
    holdStatus();
    expect(await prompt).toMatchObject({ execution: 'not-sent' });
    expect(sends).toEqual([]);
  });

  it('native hook denial retains explicit not-sent execution evidence', async () => {
    const { api, cwd, env, fake } = await boot([], { messageSend: async () => { throw new Error('known denied before send'); } });
    const backend = await PiBackend.connect({ instanceId: api.instance!.id, cwd }, env);
    await expect(backend.prompt('not sent', { timeoutMs: 1000 })).rejects.toMatchObject({ execution: 'not-sent' });
    expect(fake.sent).toHaveLength(0);
    await backend.close();
  });
  it('retains an uncertain keyed handoff instead of executing its retry again', async () => {
    const { fake, client } = await boot();
    const send = fake.pi.sendMessage;
    fake.pi.sendMessage = (message, options) => { send(message, options); throw new Error('failure after handoff'); };
    const params = { text: 'work', key: 'same-handoff', requireIdle: true };
    await expect(client.call('message.send', params)).rejects.toMatchObject({ data: { execution: 'uncertain' } });
    await expect(client.call('message.send', params)).rejects.toMatchObject({ data: { execution: 'uncertain' } });
    expect(fake.sent).toHaveLength(1);
  });

  it.each(['busy', 'session', 'changed-key', 'capacity'])('reports %s refusal as not-sent before dispatch', async (reason) => {
    const { fake, ctx, client } = await boot();
    const input = { text: 'requested work', key: 'refused', requireIdle: true, expectedSessionId: 'review-session' };
    let before = 0;
    if (reason === 'busy') ctx.isIdle = () => false;
    if (reason === 'session') input.expectedSessionId = 'another-session';
    if (reason === 'changed-key') {
      await client.call('message.send', input);
      input.text = 'different work';
      before = 1;
    }
    if (reason === 'capacity') {
      for (let index = 0; index < 128; index++) {
        await client.call('message.send', { ...input, key: `accepted-${index}` });
        await fake.emit('agent_settled', {}, ctx);
      }
      before = 128;
    }
    await expect(client.call('message.send', input)).rejects.toMatchObject({ data: { execution: 'not-sent' } });
    expect(fake.sent).toHaveLength(before);
  });

});

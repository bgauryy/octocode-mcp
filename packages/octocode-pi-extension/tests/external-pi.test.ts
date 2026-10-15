import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OctocodeApi, type ApiOperations } from '../src/api/bridge.js';
import { ApiClient } from '../src/api/client.js';
import { apiDir, writeRecord } from '../src/api/registry.js';
import { PiBackend } from '../src/external/pi.js';
import { fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

const running: OctocodeApi[] = [];
afterEach(async () => { await Promise.all(running.splice(0).map((api) => api.stop())); });

async function boot(http = false, operations: ApiOperations = {}) {
  const cwd = fs.realpathSync(tmp('external-pi-work-'));
  const env = { OCTOCODE_HOME: tmp('external-pi-home-') };
  const state = { idle: true, pending: false, sessionId: 'session-one' };
  const fake = fakePi();
  const abort = vi.fn(() => { state.idle = true; });
  const api = new OctocodeApi(fake.pi, { list: () => [], tell: () => ({}), deliverable: (text) => text }, () => 'test', env, operations);
  api.observe();
  const ctx = {
    cwd, isIdle: () => state.idle, hasPendingMessages: () => state.pending, abort,
    getContextUsage: () => undefined,
    sessionManager: { getSessionId: () => state.sessionId, getSessionName: () => undefined, getBranch: () => [] },
  };
  await api.start(ctx as never, http ? { socket: false, http: 0 } : { socket: true });
  running.push(api);
  const backend = await PiBackend.connect({ instanceId: api.instance!.id, cwd }, env);
  const settle = async (text = 'finished') => {
    await fake.emit('agent_end', { messages: [{ role: 'assistant', content: [{ type: 'text', text }], stopReason: 'stop' }] }, ctx);
    state.idle = true;
    await fake.emit('agent_settled', {}, ctx);
  };
  return { api, backend, env, state, fake, abort, cwd, settle, client: new ApiClient(api.instance!) };
}

describe('native external Pi adapter', () => {
  it.each([false, true])('waits for run settlement through the real transport (HTTP=%s)', async (http) => {
    const { backend, fake, settle } = await boot(http);
    const result = backend.prompt('run this', { timeoutMs: 1000, key: 'one' });
    await vi.waitFor(() => expect(fake.sent).toHaveLength(1));
    await expect(backend.prompt('other', { timeoutMs: 1000 })).rejects.toThrow('in flight');
    await settle();
    await expect(result).resolves.toEqual({ text: 'finished', stopReason: 'stop' });
    await expect(backend.prompt('run this', { timeoutMs: 1000, key: 'one' })).resolves.toEqual({ text: 'finished', stopReason: 'stop' });
    await expect(backend.prompt('changed', { timeoutMs: 1000, key: 'one' })).rejects.toMatchObject({ code: -32602 });
    expect(fake.sent).toHaveLength(1);
    await backend.close();
  });

  it('accepts the same canonical workspace through a symlink', async () => {
    const { api, env, cwd } = await boot();
    const alias = path.join(tmp('external-pi-alias-'), 'workspace');
    fs.symlinkSync(cwd, alias, 'dir');
    const backend = await PiBackend.connect({ instanceId: api.instance!.id, cwd: alias }, env);
    expect(backend.cwd).toBe(cwd);
    await backend.close();
  });

  it('requires an exact discovered instance, matching protocol and workspace', async () => {
    const { api, env, cwd } = await boot();
    await expect(PiBackend.connect({ instanceId: 'absent', cwd }, env)).rejects.toThrow('discoverable');
    await expect(PiBackend.connect({ instanceId: api.instance!.id, cwd: tmp('other-workspace-') }, env)).rejects.toThrow('workspace mismatch');
    writeRecord(apiDir(env), { ...api.instance!, protocol: 99 });
    await expect(PiBackend.connect({ instanceId: api.instance!.id, cwd }, env)).rejects.toThrow('protocol');
  });

  it('checks the initialized identity rather than trusting a registry label', async () => {
    const { api, env, cwd } = await boot();
    writeRecord(apiDir(env), { ...api.instance!, id: 'forged-instance' });
    await expect(PiBackend.connect({ instanceId: 'forged-instance', cwd }, env)).rejects.toThrow('identity');
  });

  it.each(['working', 'pending'])('refuses %s interactive work without sending or aborting it', async (busy) => {
    const { backend, state, fake, abort } = await boot();
    if (busy === 'working') state.idle = false;
    else state.pending = true;
    await expect(backend.prompt('interrupt', { timeoutMs: 1000 })).rejects.toThrow('busy');
    await backend.cancel();
    await backend.close();
    expect(fake.sent).toHaveLength(0);
    expect(abort).not.toHaveBeenCalled();
  });

  it('rejects replacement before a prompt and before cancelling accepted work', async () => {
    const { backend, state, fake, abort, settle } = await boot();
    const pending = backend.prompt('owned', { timeoutMs: 1000, key: 'owned' });
    const failed = expect(pending).rejects.toThrow('replaced');
    await vi.waitFor(() => expect(fake.sent).toHaveLength(1));
    state.sessionId = 'new-session';
    await expect(backend.cancel()).rejects.toThrow('replaced');
    await failed;
    expect(abort).not.toHaveBeenCalled();
    await expect(backend.prompt('later', { timeoutMs: 1000, key: 'owned' })).rejects.toThrow();
    await settle();
  });

  it.each([false, true])('retains accepted work after timeout and never resends an unchanged key (HTTP=%s)', async (http) => {
    const { backend, fake, settle } = await boot(http);
    await expect(backend.prompt('long task', { timeoutMs: 1000, key: 'stable' })).rejects.toMatchObject({ code: -32001 });
    expect(fake.sent).toHaveLength(1);
    await expect(backend.prompt('other task', { timeoutMs: 1000, key: 'other' })).rejects.toThrow('earlier');
    const retry = backend.prompt('long task', { timeoutMs: 1000, key: 'stable' });
    await settle('eventual result');
    await expect(retry).resolves.toEqual({ text: 'eventual result', stopReason: 'stop' });
    expect(fake.sent).toHaveLength(1);
  });

  it('does not abort a later interactive run when cancelling or disconnecting', async () => {
    const { backend, state, fake, settle, abort } = await boot();
    const prompt = backend.prompt('owned', { timeoutMs: 1000 });
    await vi.waitFor(() => expect(fake.sent).toHaveLength(1));
    await settle();
    await prompt;
    state.idle = false;
    await backend.cancel();
    await backend.close();
    expect(abort).not.toHaveBeenCalled();
    await expect(backend.prompt('closed', { timeoutMs: 1000 })).rejects.toThrow('closed');
  });

  it('cancels only an accepted run this connection owns', async () => {
    const { backend, state, fake, settle, abort } = await boot();
    const prompt = backend.prompt('owned', { timeoutMs: 1000 });
    await vi.waitFor(() => expect(fake.sent).toHaveLength(1));
    state.idle = false;
    await backend.cancel();
    expect(abort).toHaveBeenCalledOnce();
    await settle('cancelled');
    await prompt;
  });

  it('cleans up an aborted request and preserves cancellation ownership', async () => {
    const { backend, state, fake, settle, abort } = await boot();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const prompt = backend.prompt('owned', { timeoutMs: 1000, signal: controller.signal });
    const failed = expect(prompt).rejects.toThrow('aborted');
    await vi.waitFor(() => expect(fake.sent).toHaveLength(1));
    state.idle = false;
    controller.abort();
    await failed;
    await vi.waitFor(() => expect(abort).toHaveBeenCalledOnce());
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    await settle();
    await backend.close();
  });

  it('coalesces concurrent cancellation of the same accepted run', async () => {
    const { backend, fake, settle, abort } = await boot();
    const prompt = backend.prompt('owned', { timeoutMs: 1000 });
    await vi.waitFor(() => expect(fake.sent).toHaveLength(1));
    await Promise.all([backend.cancel(), backend.cancel()]);
    await settle('cancelled');
    await expect(prompt).resolves.toMatchObject({ text: 'cancelled' });
    expect(abort).toHaveBeenCalledOnce();
  });

  it('holds new prompt admission until an earlier cancellation finishes', async () => {
    const { backend, fake, settle } = await boot();
    const first = backend.prompt('first', { timeoutMs: 1000 });
    await vi.waitFor(() => expect(fake.sent).toHaveLength(1));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const statusOwner = backend as unknown as { status: () => Promise<Record<string, unknown>> };
    const original = statusOwner.status.bind(backend);
    const status = vi.spyOn(statusOwner, 'status').mockImplementationOnce(async () => { await gate; return original(); });
    const cancellation = backend.cancel();
    await settle('first finished naturally');
    await first;
    try {
      await expect(backend.prompt('too early', { timeoutMs: 1000 })).rejects.toThrow('cancellation');
    } finally {
      release();
      await cancellation.catch(() => undefined);
      await settle();
      status.mockRestore();
    }
    const later = backend.prompt('later', { timeoutMs: 1000 });
    await vi.waitFor(() => expect(fake.sent).toHaveLength(2));
    await settle('later completed');
    await expect(later).resolves.toMatchObject({ text: 'later completed' });
  });

  it('disconnect releases the waiting client and aborts only its own accepted run', async () => {
    const { backend, fake, abort } = await boot();
    const prompt = backend.prompt('owned', { timeoutMs: 1000 });
    const failed = expect(prompt).rejects.toThrow('aborted');
    await vi.waitFor(() => expect(fake.sent).toHaveLength(1));
    await backend.close();
    await failed;
    expect(abort).toHaveBeenCalledOnce();
  });

  it('pre-aborted prompts have no delivery side effects', async () => {
    const { backend, fake } = await boot();
    const controller = new AbortController();
    controller.abort();
    await expect(backend.prompt('never', { timeoutMs: 1000, signal: controller.signal })).rejects.toThrow('aborted');
    expect(fake.sent).toHaveLength(0);
  });

  it('atomically guards send and abort, including the acceptance-to-agent-start gap', async () => {
    const { client, fake, abort, state, settle } = await boot();
    const params = { text: 'one', expectedSessionId: 'session-one', requireIdle: true, key: 'one' };
    const first = await client.call('message.send', params);
    await expect(client.call('message.send', { ...params, key: 'two' })).rejects.toMatchObject({ code: -32000 });
    await expect(client.call('message.send', { ...params, text: 'changed' })).rejects.toMatchObject({ code: -32602 });
    await expect(client.call('message.send', { ...params, expectedSessionId: 'wrong' })).rejects.toMatchObject({ code: -32000 });
    await expect(client.call('turn.abort', { key: 'other', expectedSessionId: 'session-one' })).rejects.toMatchObject({ code: -32000 });
    await expect(client.call('message.send', params)).resolves.toEqual(first);
    expect(fake.sent).toHaveLength(1);
    expect(abort).not.toHaveBeenCalled();
    await settle();
    state.idle = false;
    await expect(client.call('turn.abort', { key: 'one', expectedSessionId: 'session-one' })).rejects.toMatchObject({ code: -32000 });
    expect(abort).not.toHaveBeenCalled();
  });

  it('retains receipts at capacity and clears them only for actual replacement', async () => {
    const { client, fake, state, settle } = await boot();
    for (let index = 0; index < 128; index++) {
      await client.call('message.send', { text: 'same', key: `key-${index}` });
      await settle();
    }
    await expect(client.call('message.send', { text: 'same', key: 'overflow' })).rejects.toMatchObject({ code: -32000 });
    await expect(client.call('message.send', { text: 'same', key: 'key-0' })).resolves.toMatchObject({ id: 'x1' });
    expect(fake.sent).toHaveLength(128);
    state.sessionId = 'replacement';
    await client.call('message.send', { text: 'same', key: 'overflow', expectedSessionId: 'replacement' });
    expect(fake.sent).toHaveLength(129);
  });
  it('runs the send hook before delivery and carries the raw inbound envelope', async () => {
    const hook = vi.fn(async () => undefined);
    const { client, fake } = await boot(false, { messageSend: hook });
    await client.call('message.send', { text: 'raw text', from: 'peer', key: 'hook' });
    expect(hook).toHaveBeenCalledWith(expect.objectContaining({ channel: 'external', direction: 'inbound', from: 'peer', to: 'session-one', text: 'raw text' }), expect.any(Object), expect.any(AbortSignal));
    expect(fake.sent[0]!.message.details.message).toMatchObject({ text: 'raw text', direction: 'inbound' });
  });

  it('same-key callers share asynchronous preparation and do not claim acceptance early', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const hook = vi.fn(() => gate);
    const { client, fake } = await boot(false, { messageSend: hook });
    const params = { text: 'once', key: 'same', requireIdle: true, expectedSessionId: 'session-one' };
    const first = client.call('message.send', params);
    await vi.waitFor(() => expect(hook).toHaveBeenCalledOnce());
    const duplicate = client.call('message.send', params);
    let returned = false;
    void duplicate.then(() => { returned = true; });
    await client.call('ping');
    expect(returned).toBe(false);
    expect(fake.sent).toHaveLength(0);
    release();
    expect(await first).toEqual(await duplicate);
    expect(fake.sent).toHaveLength(1);
    expect(hook).toHaveBeenCalledOnce();
  });

  it.each(['busy', 'session'])('rechecks %s after an asynchronous send hook', async (change) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const hook = vi.fn(() => gate);
    const { client, fake, state } = await boot(false, { messageSend: hook });
    const send = client.call('message.send', { text: 'protected', key: 'prepared', requireIdle: true });
    const rejected = expect(send).rejects.toMatchObject({ code: -32000 });
    await vi.waitFor(() => expect(hook).toHaveBeenCalledOnce());
    if (change === 'busy') state.idle = false;
    else state.sessionId = 'replaced';
    release();
    await rejected;
    expect(fake.sent).toHaveLength(0);
  });

  it.each(['cancel', 'timeout', 'shutdown'])('cancels preparation on %s without aborting unrelated model work', async (reason) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let signal: AbortSignal | undefined;
    const hook = vi.fn((_message, _ctx, ownSignal) => { signal = ownSignal; return gate; });
    const { client, fake, abort, api } = await boot(false, { messageSend: hook });
    const send = client.call('message.send', { text: 'protected', key: 'prepared', requireIdle: true, wait: true, timeoutMs: 1000 });
    const rejected = expect(send).rejects.toThrow();
    await vi.waitFor(() => expect(hook).toHaveBeenCalledOnce());
    if (reason === 'cancel') await client.call('turn.abort', { key: 'prepared', expectedSessionId: 'session-one' });
    else if (reason === 'shutdown') await api.stop();
    await rejected;
    expect(signal?.aborted).toBe(true);
    release();
    await Promise.resolve();
    expect(fake.sent).toHaveLength(0);
    expect(abort).not.toHaveBeenCalled();
  });

  it('preserves external call execution and partial evidence on RPC errors', async () => {
    const { client } = await boot(false, { externalCall: async () => { throw Object.assign(new Error('backend failed'), { execution: 'accepted', partial: { text: 'partial' } }); } });
    await expect(client.call('external.call', { action: 'prompt' })).rejects.toMatchObject({ code: -32000, data: { execution: 'accepted', partial: { text: 'partial' } } });
  });

});
